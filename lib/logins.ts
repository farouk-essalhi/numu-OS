// Username and password rules for choosing your own login. The username rule
// is the same as the database's (team_members_username_format,
// public.set_my_login); the password rule is the app's (Supabase Auth's own
// minimum is lower).

export const USERNAME_HINT = "3 to 30 characters: letters, numbers, dots, dashes or underscores, starting with a letter";

/** Lowercase and trim, the way it's stored. */
export function normalizeUsername(s: string): string {
  return s.trim().toLowerCase();
}

/** A reason the username won't do, or null if it's fine. */
export function usernameProblem(s: string): string | null {
  const v = normalizeUsername(s);
  if (!v) return "Choose a username";
  if (v.length < 3) return "At least 3 characters";
  if (v.length > 30) return "At most 30 characters";
  if (!/^[a-z]/.test(v)) return "Start with a letter";
  if (!/^[a-z][a-z0-9._-]*$/.test(v)) return "Only letters, numbers, dots, dashes or underscores (no spaces)";
  return null;
}

export const PASSWORD_HINT = "At least 8 characters, with a letter and a number";

/** A reason the password won't do, or null if it's fine. */
export function passwordProblem(pw: string, username?: string): string | null {
  if (pw.length < 8) return "At least 8 characters";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number";
  if (username && pw.toLowerCase().includes(normalizeUsername(username))) return "Don't put your username in your password";
  if (/^(password|12345678|qwerty)/i.test(pw)) return "That one is too easy to guess";
  return null;
}

/** A plain-words version of Supabase Auth's password errors. */
export function authPasswordError(message: string): string {
  if (/different from the old password|same_password/i.test(message)) return "Choose a password different from the one you were given";
  if (/weak|pwned|leaked|compromised/i.test(message)) return "That password is known from a leak. Choose another";
  if (/at least \d+ characters|should be at least/i.test(message)) return "That password is too short";
  if (/reauth|recent/i.test(message)) return "Sign out and back in, then try again";
  if (/fetch|network/i.test(message)) return "Can't reach NUMU OS. Check your connection";
  return message;
}
