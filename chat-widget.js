
(function(){
  const qs  = (sel,root=document)=>root.querySelector(sel);
  const qsa = (sel,root=document)=>[...root.querySelectorAll(sel)];
  const overlay = qs('#lp-chat-overlay');
  const chatlog = qs('#lpChatlog', overlay);
  const input   = qs('#lpInput', overlay);
  const form    = qs('#lpForm', overlay);
  const progress= qs('#lpProgress', overlay);
  const launcher= qs('#lpLauncher');
  const closeBtn= qs('#lpCloseBtn');

  setTimeout(()=>overlay.classList.remove('lp-hidden'), 800);
  launcher.addEventListener('click', ()=>overlay.classList.remove('lp-hidden'));
  closeBtn.addEventListener('click', ()=>overlay.classList.add('lp-hidden'));

  function addMsg(role, text, options){
    const row = document.createElement('div');
    row.className = 'lp-msg ' + (role === 'user' ? 'user':'bot');
    const bubble = document.createElement('div');
    bubble.className = 'lp-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    chatlog.appendChild(row);
    chatlog.scrollTop = chatlog.scrollHeight;
    if(options && options.choices){
      const wrap = document.createElement('div');
      wrap.className = 'lp-choices';
      options.choices.forEach(c=>{
        const b = document.createElement('button');
        b.className='lp-choice';
        b.type='button';
        b.textContent=c.label;
        b.addEventListener('click',()=>{
          handleChoice(c.value, c.label);
        });
        wrap.appendChild(b);
      });
      bubble.appendChild(wrap);
    }
  }

  function setProgress(pct){
    progress.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  const state = { path:null, answers:{}, step:0 };

  const flow = [
    {
      id:'intro',
      bot: "Hey 👋 I’m Alex from Listplicity. Quick one — are you looking to sell a home, buy one, or both?",
      choices:[
        {label:'Sell', value:'sell'},
        {label:'Buy', value:'buy'},
        {label:'Both', value:'both'}
      ],
      onChoice(val){ state.path = val; next(); }
    },
    { id:'sell_value', when:s=>s.path!=='buy',
      bot:"Nice — selling can be huge if you position it right. Want a free pro pricing strategy? (takes ~60 sec)",
      choices:[{label:'Yes',value:'yes'},{label:'Skip',value:'skip'}],
      onChoice(){ next(); }
    },
    { id:'sell_address', when:s=>s.path!=='buy', bot:"What’s the property address?", expect:'text', key:'address' },
    { id:'sell_timeline', when:s=>s.path!=='buy', bot:"Ideal timeline to sell? (e.g., 30–60 days, ASAP, just exploring)", expect:'text', key:'sell_timeline' },

    { id:'buy_intro', when:s=>s.path!=='sell',
      bot:"Awesome — I can unlock my MLS-connected app so you see homes the second they hit. Want me to set that up?",
      choices:[{label:'Yes',value:'yes'},{label:'Skip',value:'skip'}],
      onChoice(){ next(); }
    },
    { id:'buy_area', when:s=>s.path!=='sell', bot:"Which areas or school zones are you targeting?", expect:'text', key:'buy_area' },
    { id:'buy_budget', when:s=>s.path!=='sell', bot:"What price range are you considering?", expect:'text', key:'buy_budget' },
    { id:'buy_preapproval', when:s=>s.path!=='sell',
      bot:"Are you pre-approved?",
      choices:[{label:'Yes',value:'yes'},{label:'No',value:'no'},{label:'Not sure',value:'unsure'}],
      onChoice(val){ state.answers.buy_preapproval = val; next(); }
    },

    { id:'contact_name', bot:"Cool — I’ll send your results right away. What’s your first and last name?", expect:'text', key:'name' },
    { id:'contact_email', bot:"Best email to send your report/app link?", expect:'text', key:'email',
      validate:v=>/.+@.+\..+/.test(v) ? true : "Please enter a valid email." },
    { id:'contact_phone', bot:"And a mobile number so I can text you the link?", expect:'text', key:'phone',
      validate:v=>v.replace(/\D/g,'').length>=10 ? true : "Please enter a valid phone number." },

    { id:'confirm',
      bot:s=>{
        const bits=[];
        if(s.path) bits.push(`Path: ${s.path}`);
        if(s.answers.address) bits.push(`Address: ${s.answers.address}`);
        if(s.answers.sell_timeline) bits.push(`Sell timeline: ${s.answers.sell_timeline}`);
        if(s.answers.buy_area) bits.push(`Buy areas: ${s.answers.buy_area}`);
        if(s.answers.buy_budget) bits.push(`Budget: ${s.answers.buy_budget}`);
        if(s.answers.buy_preapproval) bits.push(`Pre-approval: ${s.answers.buy_preapproval}`);
        bits.push(`Name: ${s.answers.name}`);
        bits.push(`Email: ${s.answers.email}`);
        bits.push(`Phone: ${s.answers.phone}`);
        return "Perfect — here’s what I’ve got:\n\n" + bits.join("\n") + "\n\nShould I lock this in and send everything now?";
      },
      choices:[{label:'Yes, send it ✅',value:'yes'},{label:'Edit something ✏️',value:'edit'}],
      onChoice(val){
        if(val==='yes'){ submitLead(); }
        else { addMsg('bot',"No problem — tell me what to change (e.g., 'change budget to 450k'), then hit Send."); editingMode=true; }
      }
    },
    { id:'thanks',
      bot:s=> s.path==='sell'
        ? "All set ✅ I’ll deliver your pricing strategy ASAP. Want tips on selling for top dollar in your area?"
        : (s.path==='buy' ? "All set ✅ Your MLS app link is on the way. Want a curated list of off‑market homes?" : "All set ✅ I’ll send both your pricing strategy and MLS app link.")
    }
  ];

  let editingMode=false;

  function currentStep(){
    for(let i=state.step;i<flow.length;i++){
      const f=flow[i];
      if(!f.when || f.when(state)) return i;
    }
    return flow.length-1;
  }
  function renderStep(i){
    const f=flow[i];
    const text=(typeof f.bot==='function') ? f.bot(state) : f.bot;
    addMsg('bot', text, f.choices ? {choices:f.choices} : null);
    setProgress(Math.round((i/(flow.length-1))*100));
    if(f.expect){ input.placeholder='Type here...'; input.focus(); }
  }
  function handleChoice(val, label){
    addMsg('user', label || val);
    const f=flow[currentStep()];
    if(f.onChoice) f.onChoice(val);
  }
  async function submitLead(){
    addMsg('bot',"Sending your info now…");
    try{
      const payload = { path: state.path, answers: state.answers, userAgent: navigator.userAgent, ts: new Date().toISOString() };
      const res = await fetch('/api/lead', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Lead submit failed.');
      addMsg('bot',"Done ✅ You’ll see a text/email from me shortly. Want to book a quick strategy call?");
    }catch(err){
      addMsg('bot',"Hmm, something hiccuped while sending. You can also text me and I’ll confirm: [your number].");
      console.error(err);
    }
  }
  function next(){ state.step = currentStep()+1; renderStep(state.step); }
  function start(){
    overlay.classList.remove('lp-hidden');
    addMsg('bot',"Welcome to Listplicity — let’s get you set up.");
    renderStep(0);
  }
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const val = input.value.trim();
    if(!val) return;
    addMsg('user', val);
    const f = flow[currentStep()];
    if(editingMode){
      const lower = val.toLowerCase();
      const pairs = [['address','address'],['timeline','sell_timeline'],['area','buy_area'],['budget','buy_budget'],['name','name'],['email','email'],['phone','phone']];
      for(const [needle,key] of pairs){
        if(lower.includes(needle)){ state.answers[key] = val.replace(/^(change|update)\s+/i,''); addMsg('bot',`Updated ${key}.`); editingMode=false; break; }
      }
      state.step = flow.findIndex(x=>x.id==='confirm');
      renderStep(state.step); input.value=''; return;
    }
    if(f && f.expect){
      if(f.validate){
        const ok=f.validate(val);
        if(ok!==true){ addMsg('bot', ok); input.value=''; return; }
      }
      if(f.key) state.answers[f.key]=val;
      input.value=''; next(); return;
    }
    input.value=''; next();
  });
  start();
})();
