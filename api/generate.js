import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DAY_NAMES = ['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];
const DAY_MAP   = [1,2,3,4,5,6,0]; // ob인덱스(0=월) → JS요일(0=일)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { goals, slots } = req.body;
  if (!goals?.length || !slots?.length) {
    return res.status(400).json({ error: 'goals와 slots가 필요합니다' });
  }

  // 요일별 가용 시간 계산
  const dailyInfo = slots.map((day, di) => {
    const hours = day.filter(Boolean).length * 0.5;
    if (hours === 0) return null;

    // 연속 시간대 묶기
    const ranges = [];
    let start = -1;
    day.forEach((on, si) => {
      if (on && start === -1) start = si;
      if (!on && start !== -1) {
        ranges.push(slotToTime(start) + '–' + slotToTime(si));
        start = -1;
      }
    });
    if (start !== -1) ranges.push(slotToTime(start) + '–' + slotToTime(32));

    return { name: DAY_NAMES[di], jsDay: DAY_MAP[di], hours, ranges: ranges.join(', ') };
  }).filter(Boolean);

  const totalHours = dailyInfo.reduce((t, d) => t + d.hours, 0);

  const prompt = `당신은 취업 준비생을 위한 학습 플래너 AI입니다.
아래 가용 시간과 목표를 보고 요일별 상세 학습 플랜을 JSON으로 생성하세요.

## 주간 가용 시간 (총 ${totalHours}시간)
${dailyInfo.map(d => `- ${d.name} (key: "${d.jsDay}"): ${d.hours}시간 (${d.ranges})`).join('\n')}

## 학습 목표
${goals.map(g => `- ${g.name}: 주 ${g.weeklyHours}시간`).join('\n')}

## 출력 형식 (JSON만, 설명 없이)
{
  "1": [{"s":"섹션명","t":"구체적 태스크 (30-60분 분량)","g":"태그코드"}],
  "2": [...],
  ...
}

## 태그 코드
ct=토익, cv=단어, cs=토스/스피킹, cc=코딩테스트, cj=자소서, cn=NCS, cg=기타

## 규칙
1. JSON 키는 위의 key 값만 사용 (가용시간 있는 요일만)
2. 목표 시간을 가용시간 비율대로 요일에 배분
3. 태스크는 한국어, 구체적·실행 가능하게 (추상적 금지)
4. 같은 날 태스크 반복 금지 — 다양하게
5. 섹션명(s)은 목표명 또는 시간대(예: "저녁 — 토익")
6. 매일 마지막 항목: {"s":"기타","t":"채용 공고 확인 (10분)","g":"cg"}
7. 유효한 JSON만 반환`;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const raw  = completion.choices[0].message.content;
    const json = JSON.parse(raw);

    // 숫자 키로 정규화
    const plan = {};
    for (let i = 0; i <= 6; i++) {
      const tasks = json[String(i)] || json[i];
      plan[i] = Array.isArray(tasks) ? tasks : [];
    }

    return res.status(200).json({ plan });
  } catch (err) {
    console.error('GPT error:', err.message);
    return res.status(500).json({ error: 'AI 생성 실패', detail: err.message });
  }
}

function slotToTime(si) {
  const h = 7 + Math.floor(si / 2);
  const m = (si % 2) * 30;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
