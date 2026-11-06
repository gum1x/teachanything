import type { TFunction } from "i18next";

const MAX_LENGTH = 160;

/** Translates the fixed plain-text bodies that the chat routes respond with. */
function knownChatError(t: TFunction, message: string): string | null {
  switch (message) {
    case "Too many messages. Please slow down.":
      return t("errors.chat.tooManyMessages");
    case "Invalid request":
      return t("errors.chat.invalidRequest");
    case "Message must contain text":
      return t("errors.chat.messageNeedsText");
    case "Could not start this conversation. Please try again.":
      return t("errors.chat.conversationStartFailed");
    case "Unauthorized":
      return t("errors.chat.unauthorized");
    case "Your account is pending admin approval":
      return t("errors.pendingApproval");
    case "Chatbot not found":
      return t("errors.notFoundItems.chatbot");
    case "Chatbot not found or sharing is disabled":
      return t("errors.notFoundItems.chatbotNotShared");
    case "Failed to send message":
      return t("errors.chat.sendFailed");
    default:
      return null;
  }
}

export function describeChatError(error: Error, t: TFunction): string {
  const message = error.message?.trim();
  if (!message || message.length > MAX_LENGTH || /^[{<[]/.test(message)) {
    return t("errors.chat.sendFailed");
  }
  return knownChatError(t, message) ?? message;
}
