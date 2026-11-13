const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const menus = JSON.parse(fs.readFileSync(path.join(root, 'media/food-menu.json'), 'utf8'));
const readPage = slug => fs.readFileSync(path.join(root, 'pages', slug + '.html'), 'utf8');

test('each public URL has exactly the requested events and only local jump links', () => {
  const expected = {food:['wedding','reception'], 'food-sangeet':['sangeet','wedding','reception'], 'food-haldi':['haldi','sangeet','wedding','reception']};
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  for (const [slug, events] of Object.entries(expected)) {
    const html = readPage(slug);
    assert.deepEqual([...html.matchAll(/class="menu-event" id="([^"]+)"/g)].map(m=>m[1]), events);
    assert(config.rewrites.some(r=>r.source==='/'+slug && r.destination==='/pages/'+slug));
    assert(!/href="\/food(?:-sangeet|-haldi)?"/.test(html.replace(`href="/${slug}"`, '')));
    const expectedCount = events.reduce((n,id)=>n+menus.find(e=>e.id===id).courses.reduce((c,s)=>c+s.items.length,0),0);
    assert.equal([...html.matchAll(/class="menu-item"/g)].length, expectedCount);
  }
});

test('disputed labels and component-only claims cannot produce allergy matches', () => {
  for (const slug of ['food','food-sangeet','food-haldi']) {
    const html=readPage(slug);
    for (const [, diets, content] of html.matchAll(/<li class="menu-item" data-diets="([^"]*)">([\s\S]*?)<\/li>/g)) {
      if (/Yogurt rice/.test(content) || (/Raita/.test(content) && /Label under review/.test(content))) {
        assert(!diets.split(' ').some(d=>['vg','df'].includes(d)));
      }
      if (/Chole bhatura/.test(content)) assert(!diets.split(' ').includes('gf'));
    }
    assert.match(html,/cooking oil may contain soy/);
    assert.match(html,/Missing labels do not mean/);
  }
});

// A minimal DOM adapter exercises the shipped browser script against generated
// dishes. It does not verify browser layout or native checkbox behavior.
function setup(slug) {
  const html=readPage(slug);
  const events={};
  const choices=['v','vg','df','gf','nf'].map(value=>({value,checked:false,nextElementSibling:{textContent:value}}));
  const only={checked:false};
  const status={textContent:''};
  const rows=[...html.matchAll(/<li class="menu-item" data-diets="([^"]*)">([\s\S]*?)<\/li>/g)].map(([,diets,content])=>{
    const classes=new Set(); const badge={hidden:true};
    return {dataset:{diets},content,hidden:false,classes,badge,classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},querySelector:()=>badge};
  });
  const course={hidden:false,querySelectorAll:()=>rows};
  const empty={hidden:true};
  const event={querySelector:selector=>selector==='.event-empty'?empty:rows.find(r=>r.classes.has('is-match'))};
  const form={hidden:true,querySelectorAll:()=>choices,addEventListener:(name,callback)=>events[name]=callback};
  const document={
    getElementById:id=>({'diet-form':form,'matches-only':only,'diet-status':status}[id]),
    querySelectorAll:selector=>({'.menu-item':rows,'.menu-course':[course],'.menu-event':[event]}[selector])
  };
  const window={setTimeout:fn=>fn(),addEventListener:(name,callback)=>events[name]=callback};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/food.js'),'utf8'),{document,window});
  return {choices,only,status,rows,empty,course,events,form};
}

test('highlighting preserves the whole menu; combined needs intersect; filtering and reset work', () => {
  for (const slug of ['food','food-sangeet','food-haldi']) {
    const s=setup(slug);
    assert.equal(s.form.hidden,false);
    assert(s.rows.every(r=>!r.hidden));
    s.choices.find(c=>c.value==='vg').checked=true; s.events.change();
    const vegan=s.rows.filter(r=>r.classes.has('is-match'));
    assert(vegan.length>0);
    assert(s.rows.every(r=>!r.hidden));
    assert(vegan.every(r=>!r.badge.hidden));
    assert(!vegan.some(r=>/Yogurt rice/.test(r.content)));
    s.choices.find(c=>c.value==='gf').checked=true; s.events.change();
    const combined=s.rows.filter(r=>r.classes.has('is-match'));
    assert(combined.length>0 && combined.length<vegan.length);
    assert(combined.every(r=>r.dataset.diets.split(' ').includes('gf')));
    s.only.checked=true; s.events.change();
    assert.equal(s.rows.filter(r=>!r.hidden).length,combined.length);
    s.choices.forEach(c=>c.checked=false); s.only.checked=false; s.events.reset();
    assert(s.rows.every(r=>!r.hidden && !r.classes.has('is-match')));
    assert.match(s.status.textContent,/All \d+ dishes are shown/);
  }
});

test('an empty result keeps an explanation, and filter-only with no needs shows everything', () => {
  const s=setup('food');
  s.only.checked=true; s.events.change(); assert(s.rows.every(r=>!r.hidden));
  s.rows.forEach(row=>row.dataset.diets='');
  s.choices[0].checked=true; s.events.change();
  assert(s.rows.every(r=>r.hidden));
  assert.equal(s.empty.hidden,false);
  assert.equal(s.course.hidden,true);
  assert.match(s.status.textContent,/0 draft matches/);
});


test('nut-free labels and highlights every dish without nuts, including untagged dishes', () => {
  for (const slug of ['food', 'food-sangeet', 'food-haldi']) {
    const html = readPage(slug);
    assert.match(html, /name="diet" value="nf"/);
    for (const [, diets, content] of html.matchAll(/<li class="menu-item" data-diets="([^"]*)">([\s\S]*?)<\/li>/g)) {
      const containsNuts = diets.split(' ').includes('nuts');
      assert.equal(diets.split(' ').includes('nf'), !containsNuts);
      assert.equal(content.includes('<span>Nut-free</span>'), !containsNuts);
    }
    const s = setup(slug);
    s.choices.find(c => c.value === 'nf').checked = true;
    s.events.change();
    const expected = s.rows.filter(r => !r.dataset.diets.split(' ').includes('nuts'));
    assert(expected.length > 0 && expected.length < s.rows.length);
    assert.deepEqual(s.rows.filter(r => r.classes.has('is-match')), expected);
    assert(s.rows.every(r => !r.hidden));
    // No dietary tags must still match Nut-free, but nuts overrides an explicit nf.
    s.rows[0].dataset.diets = '';
    s.rows[1].dataset.diets = 'v';
    s.rows[2].dataset.diets = 'nuts nf v';
    s.events.change();
    assert(s.rows[0].classes.has('is-match'));
    assert(s.rows[1].classes.has('is-match'));
    assert(!s.rows[2].classes.has('is-match'));
    s.choices.find(c => c.value === 'v').checked = true;
    s.events.change();
    const combined = s.rows.filter(r => {
      const diets = r.dataset.diets.split(' ');
      return !diets.includes('nuts') && diets.includes('v');
    });
    assert.deepEqual(s.rows.filter(r => r.classes.has('is-match')), combined);
    assert(!s.rows[0].classes.has('is-match'));
    s.only.checked = true;
    s.events.change();
    assert.deepEqual(s.rows.filter(r => !r.hidden), combined);
  }
});
