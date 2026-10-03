"use client";
import { CheckCircle2, Download, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import * as React from "react";
import { Field, FormError } from "@/components/common/field";
import { DefinitionList, MoneyDisplay } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate, formatDateTime } from "@/lib/format";

export type ContractView = {
  id: string;
  documentNumber: string;
  title: string;
  version: number;
  status: string;
  contentSnapshot: string;
  contentHash: string;
  createdAt: Date | string;
  signedAt: Date | string | null;
  signatures: {
    id: string;
    side: string;
    signedAt: Date | string;
    documentHash: string;
    ipAddress: string | null;
    method: string;
    user: { firstName: string; lastName: string };
    company: { legalName: string };
  }[];
};

/** Раздел «Договор»: реквизиты документа, hash, история подписаний, электронное подписание. */
export function ContractPanel({
  contract,
  canSign,
  signedByMe,
  signerName,
  signerCompany,
  amount,
  currency,
  route,
  integrityOk,
}: {
  contract: ContractView;
  canSign: boolean;
  signedByMe: boolean;
  signerName: string;
  signerCompany: string;
  amount: number | null;
  currency: string;
  route: string;
  integrityOk: boolean;
}) {
  const [agree, setAgree] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useAction();

  const sign = () =>
    run(
      (key) =>
        api<{ fullySigned: boolean }>(`/api/contracts/${contract.id}/sign`, {
          body: { password, agree: true, documentHash: contract.contentHash },
          idempotencyKey: key,
        }),
      {
        success: (d) =>
          d.fullySigned ? "Договор успешно подписан всеми сторонами" : "Договор успешно подписан. Ожидаем подпись второй стороны.",
        silentError: true,
        onError: (e) => setError(e instanceof ApiError || e instanceof Error ? errorMessage(e) : "Ошибка"),
        onSuccess: () => {
          setPassword("");
          setError(null);
        },
      },
    );

  const pending_ = contract.status === "PENDING_SIGNATURES" || contract.status === "PARTIALLY_SIGNED";

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" aria-hidden /> {contract.title}
              </CardTitle>
              <p className="text-muted-foreground text-body mt-1">
                № {contract.documentNumber} от {formatDate(contract.createdAt)}
              </p>
            </div>
            <StatusBadge kind="ContractStatus" value={contract.status} size="lg" />
          </CardHeader>
          <CardContent className="space-y-4">
            <DefinitionList
              items={[
                { label: "Версия документа", value: contract.version },
                { label: "Сумма", value: amount === null ? "—" : <MoneyDisplay amount={amount} currency={currency} /> },
                { label: "Маршрут", value: route },
                { label: "Дата", value: formatDate(contract.createdAt) },
              ]}
            />
            <div className="bg-muted/60 rounded-lg p-3">
              <p className="text-muted-foreground text-footnote">Hash документа (SHA-256)</p>
              <p className="text-footnote font-mono break-all" data-testid="contract-hash">
                {contract.contentHash}
              </p>
              <p
                className={
                  integrityOk
                    ? "text-success text-footnote mt-1 flex items-center gap-1"
                    : "text-danger text-footnote mt-1 flex items-center gap-1"
                }
              >
                {integrityOk ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
                {integrityOk ? "Целостность подтверждена: текст соответствует hash" : "ВНИМАНИЕ: текст не соответствует hash"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={`/api/contracts/${contract.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  <FileText /> Открыть PDF
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/contracts/${contract.id}/pdf?download=1`}>
                  <Download /> Скачать PDF
                </a>
              </Button>
            </div>
            <details className="bg-fill-quaternary rounded-lg">
              <summary className="text-body cursor-pointer px-3 py-2 font-medium">Текст договора</summary>
              <pre className="hairline-t text-body max-h-[420px] overflow-y-auto p-3 font-sans leading-relaxed whitespace-pre-wrap">
                {contract.contentSnapshot}
              </pre>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>История подписания</CardTitle>
          </CardHeader>
          <CardContent>
            {contract.signatures.length === 0 ? (
              <p className="text-muted-foreground text-body">Договор ещё никто не подписал.</p>
            ) : (
              <ul className="space-y-3">
                {contract.signatures.map((s) => (
                  <li key={s.id} className="text-body flex gap-3">
                    <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p>
                        <span className="font-medium">
                          {s.user.firstName} {s.user.lastName}
                        </span>{" "}
                        ({s.company.legalName}, {s.side === "CUSTOMER" ? "заказчик" : "перевозчик"})
                      </p>
                      <p className="text-muted-foreground">
                        {formatDateTime(s.signedAt)} · внутреннее электронное подтверждение{s.ipAddress ? ` · IP ${s.ipAddress}` : ""}
                      </p>
                      <p className="text-muted-foreground text-footnote font-mono break-all">hash: {s.documentHash}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="order-first h-fit 2xl:order-none">
        <CardHeader>
          <CardTitle>Электронное подписание документа</CardTitle>
          <p className="text-muted-foreground text-footnote">
            Внутреннее электронное подтверждение CargoFlow. Не является квалифицированной электронной подписью.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {signedByMe ? (
            <p className="bg-success-bg text-success text-body flex items-center gap-2 rounded-lg p-3">
              <CheckCircle2 className="size-4" aria-hidden /> Ваша компания подписала этот документ.
            </p>
          ) : !pending_ ? (
            <p className="text-muted-foreground text-body">Документ недоступен для подписания.</p>
          ) : !canSign ? (
            <p className="text-muted-foreground text-body">
              Подписать договор может уполномоченный представитель стороны сделки (руководитель компании).
            </p>
          ) : (
            <>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Подписант", value: `${signerName}, ${signerCompany}` },
                  { label: "Документ", value: `${contract.title}, № ${contract.documentNumber}, версия ${contract.version}` },
                  { label: "Сумма", value: amount === null ? "—" : <MoneyDisplay amount={amount} currency={currency} /> },
                  { label: "Маршрут", value: route },
                  { label: "Дата", value: formatDate(new Date()) },
                ]}
              />
              <div className="flex items-start gap-2">
                <Checkbox id="agree" checked={agree} onCheckedChange={(c) => setAgree(c === true)} />
                <Label htmlFor="agree" className="leading-snug font-normal">
                  Я подтверждаю ознакомление с документом и согласие с его условиями.
                </Label>
              </div>
              <Field
                id="sign-password"
                label="Пароль для подтверждения личности"
                hint="Повторная аутентификация перед подписанием"
                required
              >
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <FormError message={error} />
              <Button
                className="w-full"
                size="lg"
                disabled={!agree || !password || !integrityOk}
                loading={pending}
                loadingText="Подписываем..."
                onClick={sign}
                data-testid="sign-contract"
              >
                Подписать документ
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
