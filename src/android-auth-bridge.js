// Android-safe authentication interactions.
// Uses delegated events so DOM rebuilds/moves cannot detach working controls.
function shell() { return document.querySelector('.auth-v2'); }

function showRegistration() {
  const root = shell(); if (!root) return;
  root.querySelector('[data-auth-login]')?.setAttribute('style','display:none');
  const signup = root.querySelector('.auth-v2-signup'); if (signup) signup.style.display='none';
  const divider = root.querySelector('.auth-v2-divider'); if (divider) divider.style.display='none';
  const socials = root.querySelector('.auth-v2-socials'); if (socials) socials.style.display='none';
  root.querySelector('.auth-v2-registration')?.classList.add('on');
  setTimeout(()=>root.querySelector('#register-name')?.focus(),0);
}

function showLogin() {
  const root = shell(); if (!root) return;
  root.querySelector('.auth-v2-registration')?.classList.remove('on');
  const panel=root.querySelector('[data-auth-login]'); if(panel) panel.style.display='block';
  const signup=root.querySelector('.auth-v2-signup'); if(signup) signup.style.display='block';
  setTimeout(()=>root.querySelector('#login-name')?.focus(),0);
}

function nextRegistrationStep() {
  const root=shell(); if(!root) return;
  const username=root.querySelector('#register-name')?.value?.trim() || '';
  if(!username){ root.querySelector('#register-name')?.focus(); return; }
  const nameStep=root.querySelector('#register-step-name');
  const emailStep=root.querySelector('#register-step-email');
  const preview=root.querySelector('#register-name-preview');
  if(preview) preview.textContent=username;
  if(nameStep) nameStep.hidden=true;
  if(emailStep) emailStep.hidden=false;
  setTimeout(()=>root.querySelector('#register-email')?.focus(),0);
}

function previousRegistrationStep() {
  const root=shell(); if(!root) return;
  const nameStep=root.querySelector('#register-step-name');
  const emailStep=root.querySelector('#register-step-email');
  if(emailStep) emailStep.hidden=true;
  if(nameStep) nameStep.hidden=false;
  setTimeout(()=>root.querySelector('#register-name')?.focus(),0);
}

document.addEventListener('click',(event)=>{
  const target=event.target.closest?.('button');
  if(!target || !shell()?.contains(target)) return;

  if(target.matches('[data-open-register]')){
    event.preventDefault(); event.stopImmediatePropagation(); showRegistration(); return;
  }
  if(target.matches('.auth-v2-back')){
    event.preventDefault(); event.stopImmediatePropagation(); showLogin(); return;
  }
  if(target.id==='register-next'){
    event.preventDefault(); event.stopImmediatePropagation(); nextRegistrationStep(); return;
  }
  if(target.id==='register-back'){
    event.preventDefault(); event.stopImmediatePropagation(); previousRegistrationStep(); return;
  }
  if(target.id==='login'){
    event.preventDefault(); event.stopImmediatePropagation();
    const root=shell();
    document.dispatchEvent(new CustomEvent('aurora-auth-login',{detail:{username:root?.querySelector('#login-name')?.value||'',accessKey:root?.querySelector('#access')?.value||''}}));
    return;
  }
  if(target.id==='create'){
    event.preventDefault(); event.stopImmediatePropagation();
    const root=shell();
    document.dispatchEvent(new CustomEvent('aurora-auth-register',{detail:{username:root?.querySelector('#register-name')?.value||'',email:root?.querySelector('#register-email')?.value||''}}));
  }
},true);

document.addEventListener('keydown',(event)=>{
  if(event.key!=='Enter') return;
  const root=shell(); if(!root || !root.contains(event.target)) return;
  if(event.target?.id==='login-name' || event.target?.id==='access'){
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('aurora-auth-login',{detail:{username:root.querySelector('#login-name')?.value||'',accessKey:root.querySelector('#access')?.value||''}}));
  }
});
