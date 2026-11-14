/**
 * Erros de aplicação serializados como RFC 9457 (application/problem+json).
 * Mensagens nunca devem conter secrets, assinaturas ou payloads de entrada.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string | undefined;

  constructor(status: number, code: string, title: string, detail?: string) {
    super(title);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  trace_id?: string;
}

export function toProblem(err: AppError, traceId?: string): ProblemDetails {
  const problem: ProblemDetails = {
    type: `https://forge3d.dev/problems/${err.code}`,
    title: err.message,
    status: err.status,
    code: err.code,
  };
  if (err.detail !== undefined) problem.detail = err.detail;
  if (traceId !== undefined) problem.trace_id = traceId;
  return problem;
}

export const Errors = {
  unauthorized: (detail?: string): AppError =>
    new AppError(401, "unauthorized", "Autenticação inválida", detail),
  validation: (detail: string): AppError =>
    new AppError(400, "validation_error", "Requisição inválida", detail),
  notReady: (detail: string): AppError =>
    new AppError(503, "not_ready", "Serviço indisponível", detail),
  notFound: (detail?: string): AppError =>
    new AppError(404, "not_found", "Recurso não encontrado", detail),
};
