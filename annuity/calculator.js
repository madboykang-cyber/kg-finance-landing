import { rates } from './rates.js';

export const defaults = { type: 1, age: 40, sex: 1, premium: 500000, payYears: 10, startAge: 65 };
export const paymentTerms = [5, 7, 10, 12, 15, 20, 25, 30];

export function validate(input) {
  const errors = {};
  if (![1, 2].includes(input.type)) errors.type = '연금형태를 선택해 주세요.';
  if (![1, 2].includes(input.sex)) errors.sex = '성별을 선택해 주세요.';
  if (!Number.isInteger(input.age) || input.age < 0 || input.age > 70) errors.age = '가입나이는 0~70세의 정수로 입력해 주세요.';
  if (!Number.isInteger(input.startAge) || input.startAge < 50 || input.startAge > 80) errors.startAge = '연금개시나이는 50~80세의 정수로 입력해 주세요.';
  if (!Number.isSafeInteger(input.premium) || input.premium < 300000 || input.premium > Number.MAX_SAFE_INTEGER / 10000) errors.premium = '월보험료를 30만 원 이상의 원 단위 정수로 입력해 주세요.';
  if (!paymentTerms.includes(input.payYears)) errors.payYears = '납입기간을 선택해 주세요.';
  if (!errors.age && !errors.startAge && input.startAge - input.age < input.payYears) errors.startAge = '납입이 끝나는 나이 이상으로 연금개시나이를 설정해 주세요.';
  return errors;
}

const lookup = (table, value, column) => table.filter(row => row[0] <= value).at(-1)[column];

// Reserve!BI/BK/BM. The front-sheet scenario has no withdrawals or additional payments.
// Each month: add premium, then add accumulated paid premiums × annual simple rate / 12.
export function guaranteeSchedule(input) {
  const years = input.startAge - input.age;
  const earlyRate = input.type === 1 ? .07 : .06;
  const lateRate = input.type === 1 ? .05 : .04;
  let paid = 0, guarantee = 0;
  const schedule = [];
  for (let month = 1; month <= years * 12; month++) {
    const elapsedYear = Math.floor((month - 1) / 12);
    const payment = elapsedYear < input.payYears ? input.premium : 0;
    paid += payment;
    guarantee += payment + paid * (elapsedYear < 20 ? earlyRate : lateRate) / 12;
    schedule.push({ month, paid, guarantee });
  }
  return schedule;
}

export function calculate(input) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { errors };
  const deferYears = input.startAge - input.age;
  const schedule = guaranteeSchedule(input);
  const guarantee = schedule.at(-1).guarantee;
  const totalPaid = input.premium * input.payYears * 12;
  // Annuity!G6 floors the account value at paid premiums + 1,000 KRW.
  // At the workbook's fixed return of 0%, this floor is used; the guaranteed basis is larger.
  const basis = Math.max(guarantee, totalPaid + 1000);
  const baseRate = lookup(rates.baseRates, input.startAge, input.sex + (input.type === 1 ? 0 : 2));
  const loyaltyRate = lookup(rates.loyaltyRates, deferYears, 1);
  const annual = basis * baseRate * (1 + loyaltyRate);
  const totalTo100 = annual * (100 - input.startAge); // Original front sheet I8, both types.
  const creditRate = deferYears < 10 ? .01 : .0025;
  const yearlyFactor = 1 + creditRate;
  const monthlyPayment = annual * yearlyFactor / creditRate * (1 - yearlyFactor ** (-1 / 12));
  return { errors: {}, deferYears, totalPaid, guarantee, basis, baseRate, loyaltyRate,
    annual, monthlyPayment, totalTo100, extraTo100: totalTo100 - totalPaid,
    ratio: totalTo100 / totalPaid,
    schedule: schedule.filter(row => row.month % 12 === 0).map(row => ({ ...row, age: input.age + row.month / 12 })) };
}
