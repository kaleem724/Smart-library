document.addEventListener('submit',e=>{const f=e.target,m=f.dataset.confirm;
  if(m&&!confirm(m)){e.preventDefault();return;}
  const b=f.querySelector('button[type=submit],button:not([type])');if(b){b.disabled=true;b.dataset.t=b.innerHTML;b.innerHTML='<i class="fa fa-spinner fa-spin"></i> Please wait';setTimeout(()=>{b.disabled=false;b.innerHTML=b.dataset.t},4000);}});
