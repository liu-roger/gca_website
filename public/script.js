(function () {
  // Update Login button if logged in
  if (sessionStorage.getItem('gca_logged_in')) {
    var loginBtn = document.getElementById('nav-login-btn');
    if (loginBtn) { loginBtn.href = '/dashboard.html'; loginBtn.textContent = 'Dashboard'; }
  }

  gsap.registerPlugin(ScrollTrigger);

  gsap.from('#nav',         { opacity:0, y:-8,  duration:0.5,  ease:'power2.out' });
  gsap.from('#hero-ey',     { opacity:0, y:8,   duration:0.45, delay:0.25, ease:'power2.out' });
  gsap.from('.hero-h1 .w', { opacity:0, y:22,  duration:0.5,  delay:0.4,  ease:'power2.out', stagger:0.07 });
  gsap.from('#hero-sub',    { opacity:0, y:10,  duration:0.45, delay:0.85, ease:'power2.out' });
  gsap.from('#hero-act',    { opacity:0, y:10,  duration:0.4,  delay:1.0,  ease:'power2.out' });
  gsap.from('#hero-st',     { opacity:0, y:10,  duration:0.4,  delay:1.12, ease:'power2.out' });
  gsap.from('#canvas-frame',{ opacity:0, scale:0.97, duration:0.6, delay:0.55, ease:'power2.out' });

  document.querySelectorAll('.sr').forEach(function(el) {
    gsap.from(el, { opacity:0, y:16, duration:0.5, ease:'power2.out',
      scrollTrigger:{ trigger:el, start:'top 92%', once:true } });
  });

  var logo = document.getElementById('nav-logo-img');
  if (logo) {
    logo.addEventListener('mouseenter', function() {
      gsap.fromTo(logo, { rotate:0 },
        { keyframes:{ rotate:[0,-9,9,-4,4,0] }, duration:0.52, ease:'power2.inOut' });
    });
  }

  document.querySelectorAll('[data-count]').forEach(function(el) {
    ScrollTrigger.create({ trigger:el, start:'top 92%', once:true, onEnter:function() {
      var target = parseInt(el.dataset.count);
      var isK = target >= 1000;
      var end = isK ? target/1000 : target;
      var suffix = isK ? 'k+' : '+';
      var t0 = performance.now();
      (function tick(now) {
        var p = Math.min((now-t0)/1600, 1);
        el.textContent = Math.round((1-Math.pow(1-p,3))*end) + (p>=1?suffix:'');
        if (p<1) requestAnimationFrame(tick);
      })(performance.now());
    }});
  });

  // Canvas — great-circle flight path network
  var canvas = document.getElementById('globe-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var PURPLE = '#7B3FA0';

  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width  = Math.round(r.width  * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  var cities = [
    {nx:0.294,ny:0.272},{nx:0.500,ny:0.211},{nx:0.888,ny:0.269},{nx:0.920,ny:0.594},
    {nx:0.788,ny:0.496},{nx:0.654,ny:0.347},{nx:0.602,ny:0.504},{nx:0.371,ny:0.564},
    {nx:0.252,ny:0.392},{nx:0.702,ny:0.394},{nx:0.823,ny:0.278},{nx:0.605,ny:0.211},
    {nx:0.509,ny:0.482},{nx:0.587,ny:0.333},{nx:0.166,ny:0.281},{nx:0.506,ny:0.225},
    {nx:0.825,ny:0.289},{nx:0.338,ny:0.597},{nx:0.580,ny:0.272},{nx:0.578,ny:0.573},
  ];
  var EDGES = [
    [0,1],[0,7],[0,8],[0,14],[0,15],[0,9],[1,2],[1,5],[1,6],[1,11],[1,13],[1,15],[1,18],
    [2,3],[2,4],[2,10],[2,16],[2,5],[3,4],[3,7],[3,19],[4,5],[4,9],[4,6],[4,12],
    [5,6],[5,9],[5,13],[5,18],[6,12],[6,13],[6,19],[7,17],[7,8],[7,19],[8,14],
    [9,10],[9,13],[9,5],[10,11],[10,16],[10,2],[11,13],[11,18],[11,1],
    [12,13],[12,19],[14,15],[14,0],[15,18],[15,16],[15,1],[16,10],[16,2],
    [17,7],[18,19],[18,13],
  ];

  function ctrl(ax,ay,bx,by) {
    var mx=(ax+bx)/2,my=(ay+by)/2,dx=bx-ax,dy=by-ay;
    var d=Math.sqrt(dx*dx+dy*dy)||1, lift=d*0.38;
    var px=-dy/d, py=dx/d, sign=py>0?-1:1;
    return {cx:mx+px*lift*sign, cy:my+py*lift*sign};
  }
  function bez(t,x0,y0,cx,cy,x1,y1) {
    var u=1-t;
    return {x:u*u*x0+2*u*t*cx+t*t*x1, y:u*u*y0+2*u*t*cy+t*t*y1};
  }
  function newTr() {
    var e=EDGES[Math.floor(Math.random()*EDGES.length)];
    return {a:e[0],b:e[1],t:Math.random(),speed:0.0016+Math.random()*0.002,trail:[]};
  }
  var travelers = Array.from({length:14}, newTr);
  var pulses    = cities.map(function() { return {phase:Math.random()*200, period:180+Math.floor(Math.random()*120)}; });
  var alpha     = 0;

  function draw() {
    var W=canvas.offsetWidth||canvas.width, H=canvas.offsetHeight||canvas.height;
    ctx.clearRect(0,0,W,H);
    if (alpha<1) alpha=Math.min(1,alpha+0.014);
    ctx.globalAlpha=alpha;

    ctx.fillStyle='rgba(123,63,160,0.04)';
    for (var gx=11;gx<W;gx+=22) for (var gy=11;gy<H;gy+=22) { ctx.beginPath();ctx.arc(gx,gy,0.8,0,Math.PI*2);ctx.fill(); }

    EDGES.forEach(function(e) {
      var a=cities[e[0]],b=cities[e[1]];
      var ax=a.nx*W,ay=a.ny*H,bx=b.nx*W,by=b.ny*H;
      var c=ctrl(ax,ay,bx,by);
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(c.cx,c.cy,bx,by);
      ctx.strokeStyle='rgba(123,63,160,0.09)';ctx.lineWidth=0.75;ctx.stroke();
    });

    pulses.forEach(function(p,i) {
      p.phase=(p.phase+1)%p.period;
      if (p.phase<55) {
        var t=p.phase/55, x=cities[i].nx*W, y=cities[i].ny*H;
        ctx.beginPath();ctx.arc(x,y,t*20,0,Math.PI*2);
        ctx.strokeStyle='rgba(123,63,160,'+(1-t)*0.28+')';ctx.lineWidth=0.8;ctx.stroke();
      }
    });

    cities.forEach(function(c) {
      var x=c.nx*W,y=c.ny*H;
      var g=ctx.createRadialGradient(x,y,0,x,y,9);
      g.addColorStop(0,'rgba(123,63,160,0.16)');g.addColorStop(1,'rgba(123,63,160,0)');
      ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
      ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.strokeStyle='rgba(123,63,160,0.35)';ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fillStyle='rgba(123,63,160,0.7)';ctx.fill();
    });

    travelers.forEach(function(tr) {
      tr.t+=tr.speed;
      if (tr.t>=1){Object.assign(tr,newTr());tr.trail=[];}
      var a=cities[tr.a],b=cities[tr.b];
      var ax=a.nx*W,ay=a.ny*H,bx=b.nx*W,by=b.ny*H;
      var c=ctrl(ax,ay,bx,by);
      var pos=bez(tr.t,ax,ay,c.cx,c.cy,bx,by);
      tr.trail.push({x:pos.x,y:pos.y});
      if (tr.trail.length>16) tr.trail.shift();
      for (var k=1;k<tr.trail.length;k++) {
        var t0=tr.trail[k-1],t1=tr.trail[k];
        ctx.beginPath();ctx.moveTo(t0.x,t0.y);ctx.lineTo(t1.x,t1.y);
        ctx.strokeStyle='rgba(123,63,160,'+(k/tr.trail.length)*0.55+')';ctx.lineWidth=1.4;ctx.lineCap='round';ctx.stroke();
      }
      var glow=ctx.createRadialGradient(pos.x,pos.y,0,pos.x,pos.y,8);
      glow.addColorStop(0,'rgba(123,63,160,0.65)');glow.addColorStop(1,'rgba(123,63,160,0)');
      ctx.beginPath();ctx.arc(pos.x,pos.y,8,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
      ctx.beginPath();ctx.arc(pos.x,pos.y,2.4,0,Math.PI*2);ctx.fillStyle=PURPLE;ctx.fill();
    });

    ctx.globalAlpha=1;
    requestAnimationFrame(draw);
  }
  setTimeout(function(){requestAnimationFrame(draw);},300);

  // Input focus styles
  document.querySelectorAll('#apply-form input, #apply-form select, #apply-form textarea').forEach(function(el) {
    el.addEventListener('focus', function() { el.style.borderColor = 'var(--accent)'; el.style.boxShadow = '0 0 0 3px rgba(123,63,160,0.1)'; });
    el.addEventListener('blur',  function() { el.style.borderColor = ''; el.style.boxShadow = ''; });
  });

  // Application form submit
  var form    = document.getElementById('apply-form');
  var btn     = document.getElementById('apply-submit');
  var success = document.getElementById('apply-success');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var first = document.getElementById('f-first').value.trim();
      var last  = document.getElementById('f-last').value.trim();
      var email = document.getElementById('f-email').value.trim();
      if (!first || !last || !email) {
        gsap.fromTo(form, { x:0 }, { keyframes:{ x:[-6,6,-4,4,0] }, duration:0.35, ease:'power2.inOut' });
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Submitting\u2026';
      fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: first,
          lastName:  last,
          email:     email,
          org:       (document.getElementById('f-org')  || {}).value || '',
          role:      (document.getElementById('f-role') || {}).value || '',
          why:       (document.getElementById('f-why')  || {}).value || '',
        }),
      })
      .then(function() {
        form.querySelectorAll('input, select, textarea').forEach(function(el) { el.disabled = true; });
        btn.style.display = 'none';
        success.style.display = 'block';
        gsap.from(success, { opacity:0, y:6, duration:0.4, ease:'power2.out' });
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = 'Submit Application';
        alert('Something went wrong. Please try again.');
      });
    });
  }
})();
