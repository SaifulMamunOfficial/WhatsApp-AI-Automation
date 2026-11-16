// Kept out of the "use client" sidebar file on purpose: a server component importing a constant from a
// client module gets a reference object, not the value.

/** The cookie that remembers whether the side menu is shrunk; the server reads it so there is no flash. */
export const SIDEBAR_COOKIE = "sidebar";
