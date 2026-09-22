import {builder} from "../builder";
import {z} from 'zod';
import {getTypesEnum} from "../../lib/enum";
import {getRoomFromApiById} from "../../lib/api";
import {getUserForMutation, getUserString} from "../../lib/user";
import {restoreLocation} from "./location";
import {RMMCodeStatus} from '../../../generated/prisma';

const StorageRef = builder.prismaObject('Storage', {
  name: 'Storage',
  fields: (t: any) => ({
    barcode: t.exposeString('barcode'),
    roomDisplay: t.exposeString('roomDisplay'),
    roomType: t.relation('roomType'),
    productType: t.relation('productType'),
    storageType: t.relation('storageType'),
    storageSubType: t.relation('storageSubType'),
    createdBy: t.exposeString('createdBy'),
    createdOn: t.expose('createdOn', { type: 'DateTime' }),
    deletedBy: t.exposeString('deletedBy'),
    deletedOn: t.expose('deletedOn', { type: 'DateTime', nullable: true }),
    rmmStatus: t.exposeString('rmmStatus'),
    rmmMessage: t.exposeString('rmmMessage'),
    shelves: t.relation('shelves', {
      authScopes: {
        needPermission: 'canReadShelf'
      },
      query: (args:{}, ctx: any) => ({
        orderBy: {
          numShelf: 'asc'
        }
      })
    })
  }),
});

const StorageListResult = builder.objectRef<{
  totalCount: number;
  storages: any[];
}>('StorageListResult').implement({
  fields: (t) => ({
    totalCount: t.exposeInt('totalCount'),
    storages: t.field({
      type: [StorageRef],
      resolve: (parent) => parent.storages,
    }),
  }),
});

builder.queryType({
  fields: (t) => ({
    storage: t.prismaField({
      type: 'Storage',
      authScopes: {
        needPermission: 'canReadStorage'
      },
      args: {
        barcode: t.arg.string(),
      },
      validate: z.object({
        barcode: z.string().nonempty(),
      }),
      resolve: async (query, root, args, ctx: any, info) => {
        return ctx.prisma.storage.findUnique({
          where: {
            barcode: args.barcode
          }
        });
      },
    }),
  }),
});

builder.queryField('storages', (t) =>
  t.field({
    type: StorageListResult,
    args: {
      roomTypeSymbol: t.arg.string(),
      productTypeSymbol: t.arg.string(),
      storageTypeSymbol: t.arg.string(),
      storageSubTypeSymbol: t.arg.string(),
      searchTerm: t.arg.string(),
      page: t.arg.int(),
      pageSize: t.arg.int(),
      sortField: t.arg.string(),
      sortDirection: t.arg.string(),
    },
    validate: z.object({
      roomTypeSymbol: z.string().optional(),
      productTypeSymbol: z.string().optional(),
      storageTypeSymbol: z.string().optional(),
      storageSubTypeSymbol: z.string().optional(),
      searchTerm: z.string().optional(),
      page: z.int().nonnegative().optional(),
      pageSize: z.int().nonnegative().optional(),
      sortField: z.enum([
        "barcode", "roomDisplay", "roomType", "productType", "storageType", "storageSubType",
        "createdBy", "createdOn", "deletedBy", "deletedOn"
      ]).optional(),
      sortDirection: z.enum(["asc","desc"]).optional()
    }),
    authScopes: {
      needPermission: 'canReadStorage'
    },
    resolve: async (root, args, ctx: any) => {

      (await getTypesEnum(ctx, 'roomType', true)).optional().parse(args.roomTypeSymbol);
      (await getTypesEnum(ctx, 'productType', true)).optional().parse(args.productTypeSymbol);
      (await getTypesEnum(ctx, 'storageType', true)).optional().parse(args.storageTypeSymbol);
      (await getTypesEnum(ctx, 'storageSubType', true)).optional().parse(args.storageSubTypeSymbol);

      const where: any = {};
      if (args.roomTypeSymbol) {
        where.roomType = { symbol: args.roomTypeSymbol }
      }
      if (args.productTypeSymbol) {
        where.productType = { symbol: args.productTypeSymbol }
      }
      if (args.storageTypeSymbol) {
        where.storageType = { symbol: args.storageTypeSymbol}
      }
      if (args.storageSubTypeSymbol) {
        where.storageSubType = { symbol: args.storageSubTypeSymbol }
      }
      if (args.searchTerm) {
        where.OR = [
          {
            barcode: {
              contains: args.searchTerm,
              mode: 'insensitive'
            }
          },
          {
            roomDisplay: {
              contains: args.searchTerm,
              mode: 'insensitive'
            }
          }
        ];
      }
      const direction = args.sortDirection === 'desc' ? 'desc' : 'asc';
      const orderBy = (() => {
        switch (args.sortField) {
          case 'roomDisplay':
            return { roomDisplay: direction };
          case 'barcode':
            return { barcode: direction };
          case 'roomType':
            return { roomType: { symbol: direction } };
          case 'productType':
            return { productType: { symbol: direction } };
          case 'storageType':
            return { storageType: { symbol: direction } };
          case 'storageSubType':
            return { storageSubType: { symbol: direction } };
          case 'createdOn':
            return { createdOn: direction };
          case 'deletedOn':
            return { deletedOn: direction };
          default:
            return { createdOn: 'desc' };
        }
      })();
      const page = Number(args.page ?? 1);
      const pageSize = Number(args.pageSize ?? 50);
      const [totalCount, storages] = await Promise.all([
        ctx.prisma.storage.count({ where }),
        ctx.prisma.storage.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { totalCount, storages };
    },
  })
);

builder.mutationType({
  fields: (t) => ({
    createStorage: t.string({
      authScopes: {
        needPermission: 'canCreateStorage'
      },
      args: {
        roomId: t.arg.int(),
        roomType: t.arg.string(),
        productType: t.arg.string(),
        storageType: t.arg.string(),
        storageSubType: t.arg.string(),
        userSciper: t.arg.int(),
        userName: t.arg.string()
      },
      validate: z.object({
        roomId: z.int().nonnegative(),
        roomType: z.string().nonempty(),
        productType: z.string().nonempty(),
        storageType: z.string().nonempty(),
        storageSubType: z.string().nonempty(),
        userSciper: z.int().optional(),
        userName: z.string().optional()
      }),
      resolve: async (root, args, ctx: any) => {

        (await getTypesEnum(ctx, 'roomType')).parse(args.roomType);
        (await getTypesEnum(ctx, 'productType')).parse(args.productType);
        (await getTypesEnum(ctx, 'storageType')).parse(args.storageType);
        (await getTypesEnum(ctx, 'storageSubType')).parse(args.storageSubType);

        const room = await getRoomFromApiById(args.roomId!);
        if (!room || !room.name) {
          throw new Error("The selected room doesn't exist.");
        }
        return await ctx.prisma.$transaction(async (tx: any) => {
          const storage = await createStorage(tx, room.name, args.roomId!, args.roomType!, args.productType!, args.storageType!, args.storageSubType!,
            getUserForMutation(ctx.user, args.userSciper, args.userName));
          return storage.barcode;
        });
      },
    }),
    deleteStorage: t.boolean({
      authScopes: {
        needPermission: 'canDeleteStorage'
      },
      args: {
        barcode: t.arg.string(),
      },
      validate: z.object({
        barcode: z.string().nonempty(),
      }),
      resolve: async (root, args, ctx: any) => {
        return await ctx.prisma.$transaction(async (tx: any) => {
          await deleteStorage(tx, args.barcode!, ctx.user);
          return true;
        });
      },
    }),
    restoreStorage: t.boolean({
      authScopes: {
        needPermission: 'isAdmin'
      },
      args: {
        barcode: t.arg.string(),
      },
      validate: z.object({
        barcode: z.string().nonempty(),
      }),
      resolve: async (root, args, ctx: any) => {
        return await ctx.prisma.$transaction(async (tx: any) => {
          await restoreLocation(tx, 'storage', args.barcode!);
          return true;
        });
      },
    }),
  }),
});

async function createStorage (transaction: any,
                              roomDisplay: string,
                              roomId: number,
                              roomType: string,
                              productType: string,
                              storageType: string,
                              storageSubType: string,
                              user: UserInfo
) {
  const roomTypeObj = await transaction.roomType.findUnique({where: {symbol: roomType}});
  const productTypeObj = await transaction.productType.findUnique({where: {symbol: productType}});
  const storageTypeObj = await transaction.storageType.findUnique({where: {symbol: storageType}});
  const storageSubTypeObj = await transaction.storageSubType.findUnique({where: {symbol: storageSubType}});

  const lastNumber = await transaction.storage.aggregate({
    where: {
      roomId: roomId,
      idRoomType: roomTypeObj.id,
      idProductType: productTypeObj.id,
      idStorageType: storageTypeObj.id
    }, _max: {numStorage: true}});
  const newNumber = lastNumber._max.numStorage ? lastNumber._max.numStorage + 1 : 1;

  return await transaction.storage.create({
    data: {
      barcode: `${roomDisplay.replaceAll(' ', '.')} ${roomTypeObj.shortName}${productTypeObj.shortName} ${storageTypeObj.shortName}${newNumber} ${storageSubTypeObj.shortName}`,
      numStorage: newNumber,
      roomId: roomId,
      roomDisplay: roomDisplay,
      idRoomType: roomTypeObj.id,
      idProductType: productTypeObj.id,
      idStorageType: storageTypeObj.id,
      idStorageSubType: storageSubTypeObj.id,
      createdBy: getUserString(user),
      createdOn: new Date(),
      rmmStatus: 'ToBeCreated'
    },
  });
}

async function deleteStorage (transaction: any, barcode: string, user: UserInfo) {
  const data = {
    deletedBy: getUserString(user),
    deletedOn: new Date(),
    rmmStatus: 'ToBeDeleted'
  };
  const storage = await transaction.storage.update({
    where: {
      barcode: barcode
    },
    data: data
  });
  const shelves = (await transaction.shelf.findMany({where: {idStorage: storage.id}}))
    .map((shelf: { id: number; }) => shelf.id);
  await transaction.shelf.updateMany({
    where: {
      idStorage: storage.id
    },
    data: data
  });
  await transaction.box.updateMany({
    where: {
      idShelf: {
        in: shelves
      }
    },
    data: data
  });
}

export async function getStoragesByRMMStatus (prisma: any, status: RMMCodeStatus) {
  return await prisma.storage.findMany({
    where: {rmmStatus: status},
    include: {roomType: true}
  });
}
