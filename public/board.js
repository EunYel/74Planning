'use strict';

/* ── constants ── */
const BOARD_LS_POSTS = 'thoughts_v1_posts';
const BOARD_LS_NAME  = 'thoughts_v1_name';

const BOARD_CATS = [
  {key:'회고',    color:'#46c98a'},
  {key:'아이디어', color:'#d0a94e'},
  {key:'고민',    color:'#d07a7a'},
  {key:'기록',    color:'#6ba3d0'},
  {key:'감정',    color:'#b07ad0'},
  {key:'메모',    color:'#8a909c'},
];
const BOARD_MOODS = ['🔥','😌','😔','😣','🤔','😴','😊','😤','🥹','😎'];

/* ── state ── */
let bS = {
  posts:      [],
  view:       'feed',   // 'feed' | 'bookmark'
  detailId:   null,
  composer:   null,
  search:     '',
  sort:       'new',    // 'new' | 'hot'
  filterCat:  null,
  filterTag:  null,
  replyTo:    null,
  replyDraft: '',
  rootDraft:  '',
  myName:     '나',
};

/* ── persistence ── */
function bLoad() {
  try { const r = localStorage.getItem(BOARD_LS_POSTS); if (r) return JSON.parse(r); } catch(e){}
  return [];
}
function bPersist(posts) {
  try { localStorage.setItem(BOARD_LS_POSTS, JSON.stringify(posts)); } catch(e){}
}
function bSave(posts) { bPersist(posts); bS.posts = posts; rBoard(); }
function bLoadName() { try { return localStorage.getItem(BOARD_LS_NAME) || '나'; } catch(e){ return '나'; } }
function bSaveName(n) { try { localStorage.setItem(BOARD_LS_NAME, n); } catch(e){} }

/* ── utils ── */
function bUid()       { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function bClone(o)    { return JSON.parse(JSON.stringify(o)); }
function bCatColor(k) { const c = BOARD_CATS.find(x => x.key===k); return c ? c.color : '#8a909c'; }
function bCountC(list){ return (list||[]).reduce((n,c) => n + 1 + bCountC(c.replies||[]), 0); }
function bFindC(list, id) { for(const c of (list||[])) { if(c.id===id) return c; const r = bFindC(c.replies||[], id); if(r) return r; } return null; }
function bRemoveC(list, id) { return (list||[]).filter(c=>c.id!==id).map(c=>({...c, replies:bRemoveC(c.replies||[],id)})); }
function bExcerpt(b)  { const t=(b||'').replace(/\s+/g,' ').trim(); return t.length>92 ? t.slice(0,92)+'…' : t; }
function bFmtRel(ts)  {
  const s=Math.floor((Date.now()-ts)/1000); if(s<60) return '방금 전';
  const m=Math.floor(s/60); if(m<60) return m+'분 전';
  const h=Math.floor(m/60); if(h<24) return h+'시간 전';
  const d=Math.floor(h/24); if(d===1) return '어제'; if(d<7) return d+'일 전';
  const dt=new Date(ts); return (dt.getMonth()+1)+'/'+dt.getDate();
}
function bE(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── reset ── */
function resetBoard() {
  if (!confirm('생각.md의 모든 글을 삭제할까요?\n되돌릴 수 없어요.')) return;
  bSave([]);
  toast('생각.md를 초기화했어요');
}

/* ── nav ── */
function bSetView(v)    { bS.view=v; bS.detailId=null; rBoard(); }
function bOpenDetail(id){ bS.detailId=id; bS.replyTo=null; bS.replyDraft=''; rBoard(); }
function bCloseDetail() { bS.detailId=null; rBoard(); }

/* ── filters ── */
function bSetSearch(v)    { bS.search=v; rBoard(); }
function bSetSort(s)      { bS.sort=s; rBoard(); }
function bToggleCat(c)    { bS.filterCat = bS.filterCat===c ? null : c; rBoard(); }
function bSetTag(t)       { bS.filterTag = bS.filterTag===t ? null : t; bS.view='feed'; bS.detailId=null; rBoard(); }
function bClearFilters()  { bS.filterCat=null; bS.filterTag=null; bS.search=''; rBoard(); }

/* ── post actions ── */
function bToggleLike(id) {
  const posts=bClone(bS.posts), p=posts.find(x=>x.id===id);
  if(p){ p.liked=!p.liked; p.likes=Math.max(0,(p.likes||0)+(p.liked?1:-1)); }
  bSave(posts);
}
function bToggleBookmark(id) {
  const posts=bClone(bS.posts), p=posts.find(x=>x.id===id);
  if(p) p.bookmarked=!p.bookmarked;
  bSave(posts);
}
function bDeletePost(id) {
  if(!confirm('이 글을 삭제할까요?')) return;
  const posts=bS.posts.filter(p=>p.id!==id);
  bS.detailId=null; bSave(posts); toast('삭제했어요');
}

/* ── composer ── */
function bOpenComposer(mode, id) {
  if(mode==='edit') {
    const p=bS.posts.find(x=>x.id===id); if(!p) return;
    bS.composer={mode:'edit', id, title:p.title, body:p.body, author:p.author, category:p.category, mood:p.mood, tagsText:(p.tags||[]).join(', '), thumb:p.thumb||null};
  } else {
    bS.composer={mode:'new', id:null, title:'', body:'', author:bS.myName||'나', category:'회고', mood:'🔥', tagsText:'', thumb:null};
  }
  rBoardComposer();
}
function bCloseComposer() { bS.composer=null; rBoardComposer(); }
function bSetComposerField(k, v) { bS.composer={...bS.composer, [k]:v}; if(k==='mood'||k==='category') rBoardComposer(); }
function bOnImageFile(e) {
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=ev=>{ bS.composer={...bS.composer, thumb:ev.target.result}; rBoardComposer(); }; r.readAsDataURL(f);
}
function bSaveComposer() {
  const c=bS.composer; if(!c) return;
  const title=(c.title||'').trim(), body=(c.body||'').trim();
  if(!title&&!body){ toast('제목이나 내용을 입력해주세요'); return; }
  const tags=[...new Set((c.tagsText||'').split(/[,\s]+/).map(t=>t.replace(/^#/,'').trim()).filter(Boolean))];
  const author=(c.author||'').trim()||'익명';
  const posts=bClone(bS.posts);
  if(c.mode==='edit'){
    const p=posts.find(x=>x.id===c.id);
    if(p){ p.title=title||'(제목 없음)'; p.body=body; p.author=author; p.category=c.category; p.mood=c.mood; p.tags=tags; p.thumb=c.thumb||null; p.updatedAt=Date.now(); }
    toast('수정했어요');
  } else {
    posts.unshift({id:bUid(), title:title||'(제목 없음)', body, author, category:c.category, mood:c.mood, tags, thumb:c.thumb||null, likes:0, liked:false, bookmarked:false, createdAt:Date.now(), updatedAt:Date.now(), comments:[]});
    toast('새 글을 등록했어요');
  }
  bSaveName(author); bS.myName=author; bS.composer=null;
  bSave(posts); rBoardComposer();
}

/* ── comments ── */
function bAddComment(parentId, text) {
  text=(text||'').trim(); if(!text) return;
  const posts=bClone(bS.posts), p=posts.find(x=>x.id===bS.detailId); if(!p) return;
  if(!p.comments) p.comments=[];
  const node={id:bUid(), author:(bS.myName||'').trim()||'익명', body:text, createdAt:Date.now(), replies:[]};
  if(!parentId){ p.comments.push(node); }
  else{ const par=bFindC(p.comments,parentId); if(par){ par.replies=par.replies||[]; par.replies.push(node); } }
  bSave(posts);
}
function bDeleteComment(id) {
  if(!confirm('이 댓글과 모든 대댓글을 삭제할까요?')) return;
  const posts=bClone(bS.posts), p=posts.find(x=>x.id===bS.detailId); if(!p) return;
  p.comments=bRemoveC(p.comments||[],id); bS.replyTo=null; bSave(posts);
}
function bStartReply(id)  { bS.replyTo = bS.replyTo===id ? null : id; bS.replyDraft=''; rBoard(); }
function bCancelReply()   { bS.replyTo=null; bS.replyDraft=''; rBoard(); }
function bSubmitReply(id) {
  const t=bS.replyDraft; if(!t||!t.trim()) return;
  bS.replyTo=null; bS.replyDraft='';
  bAddComment(id,t);
}
function bSubmitRoot() {
  const t=bS.rootDraft; if(!t||!t.trim()){ toast('댓글을 입력해주세요'); return; }
  bS.rootDraft='';
  bAddComment(null,t);
}

/* ── comment tree (recursive HTML) ── */
function buildCommentTree(list, depth) {
  return (list||[]).map(c => {
    const replying = bS.replyTo===c.id;
    const kids = buildCommentTree(c.replies||[], depth+1);
    const replyForm = replying ? `
      <div style="margin:8px 0 4px;display:flex;flex-direction:column;gap:6px">
        <textarea id="rta-${bE(c.id)}" placeholder="답글 입력..." class="b-ta">${bE(bS.replyDraft)}</textarea>
        <div style="display:flex;gap:6px">
          <button onclick="bSubmitReply('${bE(c.id)}')" class="b-btn b-pri b-sm">등록</button>
          <button onclick="bCancelReply()" class="b-btn b-ghost b-sm">취소</button>
        </div>
      </div>` : '';
    return `
      <div style="margin-top:10px;padding-left:${depth>0?'14px':'0'};border-left:${depth>0?'1px solid #23262d':'none'}">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-family:var(--mono);font-size:12px;color:#d8dbe2;font-weight:600">${bE(c.author||'익명')}</span>
          <span style="font-family:var(--mono);font-size:11px;color:#5a616e">${bFmtRel(c.createdAt)}</span>
        </div>
        <div style="font-size:13.5px;color:#c2c7d0;white-space:pre-wrap;margin:4px 0 5px;line-height:1.55">${bE(c.body)}</div>
        <div style="display:flex;gap:14px">
          <button onclick="bStartReply('${bE(c.id)}')" class="b-link">${replying?'답글 닫기':'답글'}</button>
          <button onclick="bDeleteComment('${bE(c.id)}')" class="b-link b-link-del">삭제</button>
        </div>
        ${replyForm}
        ${kids ? `<div style="margin-top:2px">${kids}</div>` : ''}
      </div>`;
  }).join('');
}

/* ── filtered list ── */
function bGetList() {
  let list = bS.posts.slice();
  if(bS.view==='bookmark') list=list.filter(p=>p.bookmarked);
  if(bS.filterCat) list=list.filter(p=>p.category===bS.filterCat);
  if(bS.filterTag) list=list.filter(p=>(p.tags||[]).includes(bS.filterTag));
  const q=bS.search.trim().toLowerCase();
  if(q) list=list.filter(p=>(p.title+' '+p.body+' '+(p.tags||[]).join(' ')+' '+p.author).toLowerCase().includes(q));
  if(bS.sort==='new') list.sort((a,b)=>b.createdAt-a.createdAt);
  else list.sort((a,b)=>{ const sa=a.likes*2+bCountC(a.comments)+(a.bookmarked?1:0); const sb=b.likes*2+bCountC(b.comments)+(b.bookmarked?1:0); return (sb-sa)||(b.createdAt-a.createdAt); });
  return list;
}

/* ── render: feed / bookmark ── */
function rBoardFeed() {
  const S=bS, list=bGetList(), q=S.search.trim().toLowerCase();
  const hasFilter=!!(S.filterCat||S.filterTag||q);

  const catChips = BOARD_CATS.map(c => {
    const on=S.filterCat===c.key;
    return `<span onclick="bToggleCat('${bE(c.key)}')" class="b-chip" style="border-color:${on?c.color:'#23262d'};color:${on?'#0a0b0d':c.color};background:${on?c.color:'transparent'}">${c.key}</span>`;
  }).join('');
  const tagChip = S.filterTag ? `<span class="b-chip" style="border-color:#2f8f63;color:#46c98a;background:rgba(70,201,138,.08)">#${bE(S.filterTag)}</span>` : '';
  const clearBtn = hasFilter ? `<span onclick="bClearFilters()" class="b-clear">필터 제거</span>` : '';

  const emptyMsg = S.view==='bookmark'
    ? '// 북마크한 글이 없어요'
    : hasFilter ? '// 검색·필터 결과가 없어요' : '// 아직 글이 없어요 — 첫 생각을 기록해보세요';

  const cards = list.map(p => {
    const cc=bCatColor(p.category);
    const tags=(p.tags||[]).map(t=>`<span onclick="event.stopPropagation();bSetTag('${bE(t)}')" class="b-tag">#${bE(t)}</span>`).join('');
    const bodyRow = p.thumb
      ? `<div class="b-card-media">
           <div class="b-thumb" style="background-image:url('${p.thumb}')"></div>
           <div class="b-card-body">${bE(bExcerpt(p.body))}</div>
         </div>`
      : `<div class="b-card-body">${bE(bExcerpt(p.body))}</div>`;
    return `
      <div onclick="bOpenDetail('${bE(p.id)}')" class="b-card">
        <div class="b-card-meta">
          <span style="font-size:16px;line-height:1">${p.mood}</span>
          <span class="b-cat-dot" style="color:${cc}"><i style="background:${cc}"></i>${bE(p.category)}</span>
          <span class="b-ts">${bFmtRel(p.createdAt)}</span>
        </div>
        <div class="b-card-title">${bE(p.title||'(제목 없음)')}</div>
        ${bodyRow}
        <div class="b-card-footer">
          ${tags}
          <span class="b-reactions">
            <span onclick="event.stopPropagation();bToggleLike('${bE(p.id)}')" style="cursor:pointer;color:${p.liked?'#d07a7a':'#787e8a'}">${p.liked?'♥':'♡'} ${p.likes}</span>
            <span onclick="event.stopPropagation();bToggleBookmark('${bE(p.id)}')" style="cursor:pointer;color:${p.bookmarked?'#d0a94e':'#787e8a'}">${p.bookmarked?'★':'☆'}</span>
            <span>💬 ${bCountC(p.comments)}</span>
          </span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="b-toolbar">
      <input oninput="bSetSearch(this.value)" value="${bE(S.search)}" placeholder="검색..." class="b-search">
      <div class="b-sort-group">
        <button onclick="bSetSort('new')" class="b-sort-btn ${S.sort==='new'?'on':''}">최신순</button>
        <button onclick="bSetSort('hot')" class="b-sort-btn ${S.sort==='hot'?'on':''}">인기순</button>
      </div>
    </div>
    <div class="b-chips">${catChips}${tagChip}${clearBtn}</div>
    ${list.length===0
      ? `<div class="b-empty">${emptyMsg}</div>`
      : cards}`;
}

/* ── render: detail ── */
function rBoardDetail() {
  const p=bS.posts.find(x=>x.id===bS.detailId);
  if(!p) return '<div class="note">// 글을 찾을 수 없어요</div>';
  const cc=bCatColor(p.category);
  const tags=(p.tags||[]).length ? `<div class="b-chips" style="margin-bottom:16px">${(p.tags||[]).map(t=>`<span onclick="bSetTag('${bE(t)}')" class="b-tag">#${bE(t)}</span>`).join('')}</div>` : '';
  const thumb=p.thumb?`<img src="${p.thumb}" class="b-detail-img">` : '';
  const edited=(p.updatedAt&&p.updatedAt!==p.createdAt)?' · 수정됨':'';
  const tree=bCountC(p.comments)
    ? buildCommentTree(p.comments, 0)
    : `<div class="b-cmt-empty">// 아직 댓글이 없어요. 첫 댓글을 남겨보세요</div>`;

  return `
    <button onclick="bCloseDetail()" class="b-back">‹ 목록으로</button>
    ${thumb}
    <div class="b-detail-header">
      <span style="font-size:28px;line-height:1">${p.mood}</span>
      <div style="flex:1;min-width:0">
        <h2 class="b-detail-title">${bE(p.title||'(제목 없음)')}</h2>
        <div class="b-detail-meta">
          <span style="color:${cc}">${bE(p.category)}</span>
          <span>${bE(p.author)}</span>
          <span>${bFmtRel(p.createdAt)}${edited}</span>
        </div>
      </div>
    </div>
    ${tags}
    <div class="b-detail-body">${bE(p.body)}</div>
    <div class="b-detail-actions">
      <button onclick="bToggleLike('${bE(p.id)}')" class="b-action-btn" style="color:${p.liked?'#d07a7a':'#787e8a'}">${p.liked?'♥':'♡'} ${p.likes}</button>
      <button onclick="bToggleBookmark('${bE(p.id)}')" class="b-action-btn" style="color:${p.bookmarked?'#d0a94e':'#787e8a'}">${p.bookmarked?'★':'☆'} 북마크</button>
      <span style="margin-left:auto;display:flex;gap:10px">
        <button onclick="bOpenComposer('edit','${bE(p.id)}')" class="b-link">수정</button>
        <button onclick="bDeletePost('${bE(p.id)}')" class="b-link b-link-del">삭제</button>
      </span>
    </div>
    <div class="b-cmt-label">// 댓글 ${bCountC(p.comments)}개</div>
    ${tree}
    <div class="b-cmt-root">
      <textarea id="root-ta" placeholder="댓글 입력..." class="b-ta"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:6px">
        <button onclick="bSubmitRoot()" class="b-btn b-pri b-sm">댓글 등록</button>
      </div>
    </div>`;
}

/* ── render: composer modal ── */
function rBoardComposer() {
  const c=bS.composer;
  const bg=document.getElementById('boardComposerBg');
  if(!bg) return;
  if(!c){ bg.classList.remove('show'); return; }
  bg.classList.add('show');

  const moodBtns=BOARD_MOODS.map(m=>`<button onclick="bSetComposerField('mood','${m}')" class="b-mood-btn ${c.mood===m?'on':''}">${m}</button>`).join('');
  const catOpts=BOARD_CATS.map(cat=>`<option value="${bE(cat.key)}" ${c.category===cat.key?'selected':''}>${cat.key}</option>`).join('');
  const thumbPrev=c.thumb?`<img src="${c.thumb}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-top:8px"><button onclick="bSetComposerField('thumb',null);rBoardComposer()" class="b-link b-link-del" style="margin-top:6px;display:block">이미지 제거</button>`:'';

  bg.innerHTML = `
    <div class="b-modal">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3 style="font-size:14px;font-weight:600;color:#d8dbe2;font-family:var(--mono)">${c.mode==='edit'?'// 글 수정':'// 새 글 쓰기'}</h3>
        <button onclick="bCloseComposer()" class="b-close-btn">×</button>
      </div>
      <div class="b-field-label">기분</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${moodBtns}</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div style="flex:1"><div class="b-field-label">카테고리</div><select onchange="bSetComposerField('category',this.value)" class="b-input">${catOpts}</select></div>
        <div style="flex:1"><div class="b-field-label">작성자</div><input type="text" value="${bE(c.author)}" oninput="bSetComposerField('author',this.value)" class="b-input" placeholder="닉네임"></div>
      </div>
      <div class="b-field-label">제목</div>
      <input type="text" value="${bE(c.title)}" oninput="bSetComposerField('title',this.value)" class="b-input" placeholder="제목 (선택)" style="margin-bottom:10px">
      <div class="b-field-label">내용</div>
      <textarea oninput="bSetComposerField('body',this.value)" class="b-input b-ta" placeholder="오늘의 생각을 기록해보세요..." style="min-height:120px;margin-bottom:10px">${bE(c.body)}</textarea>
      <div class="b-field-label">태그 <span style="color:#5a616e;font-size:10px">(쉼표나 공백으로 구분)</span></div>
      <input type="text" value="${bE(c.tagsText)}" oninput="bSetComposerField('tagsText',this.value)" class="b-input" placeholder="#태그1, #태그2" style="margin-bottom:10px">
      <div class="b-field-label">이미지 <span style="color:#5a616e;font-size:10px">(선택)</span></div>
      <input type="file" accept="image/*" onchange="bOnImageFile(event)" style="font-family:var(--mono);font-size:12px;color:#787e8a">
      ${thumbPrev}
      <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">
        <button onclick="bCloseComposer()" class="b-btn b-ghost">취소</button>
        <button onclick="bSaveComposer()" class="b-btn b-pri">저장</button>
      </div>
    </div>`;
}

/* ── main render ── */
function rBoard() {
  const el=document.getElementById('v-board');
  if(!el || !el.classList.contains('on')) return;

  const subNav=`
    <div class="b-subnav">
      <button onclick="bSetView('feed')" class="b-subnav-btn ${bS.view==='feed'&&!bS.detailId?'on':''}">전체</button>
      <button onclick="bSetView('bookmark')" class="b-subnav-btn ${bS.view==='bookmark'&&!bS.detailId?'on':''}">★ 북마크</button>
      <button onclick="bOpenComposer('new')" class="b-btn b-pri b-sm" style="margin-left:auto">+ 글쓰기</button>
    </div>`;

  el.innerHTML = subNav + (bS.detailId ? rBoardDetail() : rBoardFeed());

  // re-attach live textarea handlers
  if(bS.replyTo) {
    const ta=document.getElementById(`rta-${bS.replyTo}`);
    if(ta){ ta.value=bS.replyDraft; ta.addEventListener('input',e=>{bS.replyDraft=e.target.value;}); ta.focus(); }
  }
  const rootTa=document.getElementById('root-ta');
  if(rootTa){ rootTa.value=bS.rootDraft; rootTa.addEventListener('input',e=>{bS.rootDraft=e.target.value;}); }

  // update titlebar
  if(typeof activeView !== 'undefined' && activeView==='board') {
    const p=bS.detailId ? bS.posts.find(x=>x.id===bS.detailId) : null;
    const fname=p ? (p.title||'post').slice(0,22)+'.md' : (bS.view==='bookmark'?'bookmarks.md':'thoughts.md');
    const fe=document.getElementById('fnameTab'); if(fe) fe.textContent=fname;
  }
}

/* ── init ── */
function initBoard() {
  bS.posts  = bLoad();
  bS.myName = bLoadName();
  const bg=document.getElementById('boardComposerBg');
  if(bg && !bg.__bBound){ bg.__bBound=true; bg.addEventListener('click',e=>{ if(e.target.id==='boardComposerBg') bCloseComposer(); }); }
}
