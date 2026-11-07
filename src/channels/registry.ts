import type { ChannelAdapter, ChannelType } from "./types";
import { messengerAdapter } from "./messenger/adapter";
import { whatsappAdapter } from "./whatsapp/adapter";

const adapters: Record<ChannelType, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  messenger: messengerAdapter,
};

export function getAdapter(type: ChannelType): ChannelAdapter {
  return adapters[type];
}
