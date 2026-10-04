import { route } from "@/lib/api/handler";
import { getMyDriverProfile } from "@/server/services/driver-trip.service";

/** Профили водителя в компаниях-перевозчиках (без паспортных данных). */
export const GET = route({}, async ({ actor }) =>
  (await getMyDriverProfile(actor)).map(({ passportNumber: _p, ...profile }) => {
    void _p;
    return profile;
  }),
);
