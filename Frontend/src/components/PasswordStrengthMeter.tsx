type PasswordStrengthMeterProps = {
  password: string;
};

function scorePassword(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const score = scorePassword(password);
  const label = score <= 2 ? "Weak" : score <= 4 ? "Good" : "Strong";

  return (
    <div className="password-strength-meter" data-score={score}>
      <div>
        <span />
      </div>
      <p>{password ? `${label} password` : "Use letters, numbers, and a symbol."}</p>
    </div>
  );
}

export default PasswordStrengthMeter;
