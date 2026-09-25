import { parseJson, route } from "@/lib/api/handler";
import { loadAnswerSchema } from "@/lib/validation/load";
import { answerQuestion } from "@/server/services/load.service";

export const POST = route<{ id: string }>({}, async ({ req, actor, params }) => {
  const { answer } = await parseJson(req, loadAnswerSchema);
  return answerQuestion(actor, params.id, answer);
});
