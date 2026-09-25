import "server-only";
import type { SignatureMethod } from "@/generated/prisma/enums";

/**
 * Провайдер электронного подписания.
 * В MVP реализован INTERNAL_ACCEPTANCE — внутреннее электронное подтверждение (акцепт) на платформе.
 * Для подключения внешней/квалифицированной ЭП реализуйте интерфейс и зарегистрируйте провайдер —
 * бизнес-логика ContractService не меняется.
 */
export type SignatureRequest = {
  contractId: string;
  documentHash: string;
  userId: string;
  companyId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SignatureResult = {
  method: SignatureMethod;
  signedAt: Date;
  documentHash: string;
};

export interface SignatureProvider {
  readonly method: SignatureMethod;
  readonly displayName: string;
  sign(req: SignatureRequest): Promise<SignatureResult>;
}

export class InternalAcceptanceProvider implements SignatureProvider {
  readonly method = "INTERNAL_ACCEPTANCE" as const;
  readonly displayName = "Внутреннее электронное подтверждение CargoFlow";
  async sign(req: SignatureRequest): Promise<SignatureResult> {
    return { method: this.method, signedAt: new Date(), documentHash: req.documentHash };
  }
}

export const signatureProvider: SignatureProvider = new InternalAcceptanceProvider();
