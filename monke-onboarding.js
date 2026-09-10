export const ONBOARDING_STEPS = [
  { title: 'Cześć, tu Monke 🐒', body: 'Twoja mała wyspa i nawyki w jednym miejscu. Odhaczaj nawyki, zbieraj banany, rozwijaj wyspę.' },
  { title: 'Nawyki', body: 'Dodaj swój pierwszy nawyk na zakładce "Dziś" — możesz pogrupować je np. na Rano / W ciągu dnia / Wieczorem.' },
  { title: 'Zły dzień się liczy', body: 'Każdy odhaczony nawyk daje XP i podtrzymuje streaka, nawet w wersji minimum na gorszy dzień.' },
  { title: 'Focus', body: 'Sesja skupienia na zakładce "Focus" daje 1 XP za każdą minutę — a po 5 minutach dorzuca banana.' },
  { title: 'Banany i wyspa', body: 'Zbierane banany odblokowują kolejne etapy wyspy na zakładce "Wyspa".' },
  { title: 'Cele', body: 'Na zakładce "Cele" możesz grupować nawyki w większe cele i śledzić postęp.' },
  { title: 'Zaczynamy!', body: 'To wszystko na start — dodaj pierwszy nawyk i odhacz go, żeby zobaczyć jak to działa.' },
];

export function renderOnboarding(container, onComplete) {
  let index = 0;
  function paint() {
    const step = ONBOARDING_STEPS[index];
    const isLast = index === ONBOARDING_STEPS.length - 1;
    container.innerHTML = `
      <div class="card">
        <h2>${step.title}</h2>
        <p>${step.body}</p>
        <div style="display:flex; justify-content:space-between; margin-top:12px">
          <button id="obBack" ${index === 0 ? 'disabled' : ''}>Wstecz</button>
          <span>${index + 1} / ${ONBOARDING_STEPS.length}</span>
          <button class="primary" id="obNext">${isLast ? 'Zaczynamy!' : 'Dalej'}</button>
        </div>
      </div>`;
    container.querySelector('#obBack').addEventListener('click', () => { index = Math.max(0, index - 1); paint(); });
    container.querySelector('#obNext').addEventListener('click', () => {
      if (isLast) onComplete();
      else { index += 1; paint(); }
    });
  }
  paint();
}
