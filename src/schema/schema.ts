import {builder} from "./builder";

const UserRef = builder.objectRef<UserInfo>('User');
UserRef.implement({
  description: 'Connected user info',
  fields: (t) => ({
    groups: t.exposeStringList('groups'),
    name: t.exposeString('name'),
    username: t.exposeString('username'),
    isAdmin: t.exposeBoolean('isAdmin'),
    isCosec: t.exposeBoolean('isCosec'),
    isReadOnly: t.exposeBoolean('isReadOnly'),
  }),
});

builder.queryType({
  fields: (t) => {
    return ({
      connectedUserInfo: t.field({
        type: UserRef,
        resolve: async (root, args, ctx: any, info) => {
          return ctx.user;
        },
      }),
    });
  },
});

import './types/storage';
import './types/shelf';
import './types/box';
import './types/roomType';
import './types/productType';
import './types/storageType';
import './types/storageSubType';
import './types/allowedTypeValues';
import './types/suggestRoomApi';
import './types/suggestUserApi';

export const schema = builder.toSchema();
