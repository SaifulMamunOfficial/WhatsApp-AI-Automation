import { broadcast } from "./broadcast";
import { contacts } from "./contacts";
import { holidays } from "./holidays";
import { adminPages } from "./admin-pages";
import { analytics } from "./analytics";
import { inbox } from "./inbox";
import { media } from "./media";
import { orders } from "./orders";
import { quickReplies } from "./quick-replies";
import { legal } from "./legal";
import { settings } from "./settings";
import { shell } from "./shell";
import { team } from "./team";

/** English text, keyed by the Bangla source string used in the code. */
export const EN: Record<string, string> = {
  ...shell,
  ...team,
  ...inbox,
  ...analytics,
  ...adminPages,
  ...holidays,
  ...media,
  ...orders,
  ...quickReplies,
  ...legal,
  ...contacts,
  ...broadcast,
  ...settings,
};
