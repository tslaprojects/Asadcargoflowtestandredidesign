import { parseJson, route } from "@/lib/api/handler";
import { loadQuestionSchema } from "@/lib/validation/load";
import { askQuestion } from "@/server/services/load.service";

export const POST = route<{ id: string }>({ status: 201, rateLimit: "critical" }, async ({ req, actor, params }) => {
  const { question } = await parseJson(req, loadQuestionSchema);
  return askQuestion(actor, params.id, question);
});
