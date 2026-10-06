const fs = require('fs');
const p = 'js/deep-2-dates.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace("territorial'ного", 'территориального');
s = s.replace("    whatHapped: '',\n", '');
s = s.replace('Кузьмином Мининым', 'Кузьмой Мининым');
fs.writeFileSync(p, s);
console.log(/territorial|whatHapped|Кузьмином/.test(s) ? 'STILL BAD' : 'fixed');
