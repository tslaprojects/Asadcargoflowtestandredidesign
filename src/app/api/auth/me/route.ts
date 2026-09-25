import { route } from "@/lib/api/handler";
import { toClientActor } from "@/lib/auth/actor";

export const GET = route({}, async ({ actor }) => toClientActor(actor));
