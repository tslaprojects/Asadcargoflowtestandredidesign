import { z } from "zod";
import { countrySchema, optionalText, phoneSchema, requiredText } from "./common";

export const passwordSchema = z
  .string({ message: "Введите пароль" })
  .min(8, "Пароль должен содержать не менее 8 символов")
  .max(128, "Слишком длинный пароль")
  .regex(/[A-Za-zА-Яа-я]/, "Пароль должен содержать букву")
  .regex(/[0-9]/, "Пароль должен содержать цифру");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Введите корректный email" }));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Введите пароль").max(128),
});

export const companyCreateSchema = z.object({
  type: z.enum(["SHIPPER", "CARRIER", "FORWARDER"], { message: "Выберите тип деятельности" }),
  legalName: requiredText(2, 200, "Укажите юридическое название"),
  tradeName: optionalText(200),
  registrationNumber: requiredText(3, 50, "Укажите регистрационный номер (БИН/ОГРН/USCC)"),
  taxId: optionalText(50),
  country: countrySchema,
  region: optionalText(100),
  city: requiredText(1, 100, "Укажите город"),
  address: requiredText(3, 300, "Укажите адрес"),
  postalCode: optionalText(20),
  phone: phoneSchema
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  email: z
    .union([z.literal(""), z.null(), z.undefined(), emailSchema])
    .optional()
    .transform((v) => (v ? v : null)),
  website: optionalText(200),
  description: optionalText(2000),
});

export const registerSchema = z
  .object({
    firstName: requiredText(1, 60, "Укажите имя"),
    lastName: requiredText(1, 60, "Укажите фамилию"),
    phone: phoneSchema,
    email: emailSchema,
    password: passwordSchema,
    activity: z.enum(["SHIPPER", "CARRIER", "FORWARDER"], { message: "Выберите тип деятельности" }),
    companyMode: z.enum(["create", "invite"]),
    company: companyCreateSchema.omit({ type: true }).optional(),
    inviteToken: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.companyMode === "create" && !v.company) {
      ctx.addIssue({ code: "custom", path: ["company"], message: "Заполните данные компании" });
    }
    if (v.companyMode === "invite" && !v.inviteToken) {
      ctx.addIssue({ code: "custom", path: ["inviteToken"], message: "Укажите код приглашения" });
    }
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Ссылка недействительна"),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: passwordSchema,
});

export const profileUpdateSchema = z.object({
  firstName: requiredText(1, 60, "Укажите имя"),
  lastName: requiredText(1, 60, "Укажите фамилию"),
  phone: phoneSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
});
