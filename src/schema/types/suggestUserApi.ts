import {builder} from "../builder";
import {z} from 'zod';
import { getUsersFromApi } from "../../lib/api";

const UserApiSuggestionRef = builder.objectRef<{ id: number; name: string }>('UserApiSuggestion').implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
  }),
});

builder.queryField('suggestUserApi', (t) =>
  t.field({
    type: [UserApiSuggestionRef],
    description: 'Fetches user suggestions from API',
    authScopes: {
      needPermission: 'canCreateStorage'
    },
    args: {
      searchUser: t.arg.string({ required: true, description: 'The partial user name to search for' }),
    },
    validate: z.object({
      searchUser: z.string().min(2),
    }),
    resolve: async (root, args, ctx: any) => {
      const { searchUser } = args;
      const data = await getUsersFromApi(searchUser);
      if (!data || !data.persons) {
        return [];
      }
      return data.persons.map((u: { id: number, display: string }) => ({
        id: Number(u.id),
        name: u.display
      }));
    },
  })
);
