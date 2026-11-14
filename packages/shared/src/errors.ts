/** Códigos de erro com mensagens compreensíveis para pessoas não técnicas. */
export const ERROR_MESSAGES = {
  AUTH_INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  AUTH_LOCKED: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.',
  AUTH_MFA_REQUIRED: 'Digite o código do seu aplicativo autenticador.',
  AUTH_MFA_INVALID: 'Código de verificação inválido.',
  AUTH_EMAIL_TAKEN: 'Já existe uma conta com este e-mail.',
  AUTH_SUSPENDED: 'Esta conta está suspensa. Fale com o suporte.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos o que você procurou.',
  VALIDATION: 'Alguns campos estão inválidos. Revise e tente de novo.',
  RATE_LIMITED: 'Você fez muitas solicitações seguidas. Aguarde um instante.',
  PLAN_LIMIT: 'Seu plano atual não permite esta ação.',
  SESSION_ALREADY_ACTIVE: 'Já existe uma sessão ativa para esta conexão. Encerre-a antes de iniciar outra.',
  SESSION_INVALID_TRANSITION: 'Esta ação não é possível no estado atual da sessão.',
  GAME_NOT_FOUND: 'Jogo não encontrado.',
  STREAM_KEY_IN_USE: 'Esta chave de transmissão já está em uso por outro processo.',
  CONNECTOR_UNAVAILABLE: 'A fonte de eventos do TikTok não está habilitada neste servidor.',
  INTERNAL: 'Algo deu errado do nosso lado. Já registramos o problema.',
} as const;
export type ErrorCode = keyof typeof ERROR_MESSAGES;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
}
