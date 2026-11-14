import { broadcast } from "./broadcast";
import { contacts } from "./contacts";
import { inbox } from "./inbox";
import { legal } from "./legal";
import { settings } from "./settings";
import { shell } from "./shell";

/** English text, keyed by the Bangla source string used in the code. */
export const EN: Record<string, string> = {
  ...shell,
  ...inbox,
  ...legal,
  ...contacts,
  ...broadcast,
  ...settings,
};
