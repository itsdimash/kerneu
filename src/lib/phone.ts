// Форматирует номер телефона как +<код страны> (XXX) XXX-XX-XX.
export function formatPhoneNumber(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 0) return "";

  // 1 цифра кода страны + до 10 цифр национального номера
  digits = digits.slice(0, 11);

  const code = digits.slice(0, 1);
  const rest = digits.slice(1);

  if (rest.length === 0) return "+" + code;

  let result = "+" + code + " (" + rest.slice(0, 3);
  if (rest.length >= 3) result += ")";
  if (rest.length > 3) result += " " + rest.slice(3, 6);
  if (rest.length > 6) result += "-" + rest.slice(6, 8);
  if (rest.length > 8) result += "-" + rest.slice(8, 10);

  return result;
}

// Для controlled-инпута телефона: если пользователь стёр только символ
// форматирования (скобку, пробел, дефис), удаляем и последнюю цифру —
// иначе formatPhoneNumber тут же вернёт тот же текст и стирание "залипнет".
export function formatPhoneInput(rawValue: string, prevValue: string): string {
  let digits = rawValue.replace(/\D/g, "");

  if (rawValue.length < prevValue.length) {
    const prevDigits = prevValue.replace(/\D/g, "");
    if (digits.length === prevDigits.length && digits.length > 0) {
      digits = digits.slice(0, -1);
    }
  }

  return formatPhoneNumber(digits);
}
