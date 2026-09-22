import {builder} from "../builder";
import {z} from 'zod';
import {getUserForMutation, getUserString} from "../../lib/user";
import {restoreLocation} from "./location";
import {RMMCodeStatus} from '../../../generated/prisma';

builder.prismaObject('Shelf', {
  name: 'Shelf',
  fields: (t: any) => ({
    barcode: t.exposeString('barcode'),
    createdBy: t.exposeString('createdBy'),
    createdOn: t.expose('createdOn', { type: 'DateTime' }),
    deletedBy: t.exposeString('deletedBy'),
    deletedOn: t.expose('deletedOn', { type: 'DateTime', nullable: true }),
    rmmStatus: t.exposeString('rmmStatus'),
    rmmMessage: t.exposeString('rmmMessage'),
    boxes: t.relation('boxes', {
      authScopes: {
        needPermission: 'canReadBox'
      },
      query: (args:{}, ctx: any) => ({
        orderBy: {
          numBox: 'asc'
        }
      })
    })
  }),
});

builder.mutationType({
  fields: (t) => ({
    createShelf: t.string({
      authScopes: {
        needPermission: 'canCreateShelf'
      },
      args: {
        parentBarcode: t.arg.string(),
        userSciper: t.arg.int(),
        userName: t.arg.string()
      },
      validate: z.object({
        parentBarcode: z.string().nonempty(),
        userSciper: z.int().optional(),
        userName: z.string().optional()
      }),
      resolve: async (root, args, ctx: any) => {
        const parent = await ctx.prisma.storage.findUnique({where: {barcode: args.parentBarcode!}});
        if (parent.deletedBy !== null) {
          throw new Error("You cannot add a shelf on a deleted storage")
        }
        const allowedType = await ctx.prisma.allowedTypeValue.findFirst(
          {where: {
            idRoomType: parent.idRoomType,
            idProductType: parent.idProductType,
            idStorageType: parent.idStorageType,
            idStorageSubType: parent.idStorageSubType
          }});
        if (!allowedType.allowsShelves) {
          throw new Error("You cannot add a shelf on this type of storage")
        }

        return await ctx.prisma.$transaction(async (tx: any) => {
          const shelf = await createShelf(tx, args.parentBarcode!, parent, getUserForMutation(ctx.user, args.userSciper, args.userName));
          return shelf.barcode;
        });
      },
    }),
    deleteShelf: t.boolean({
      authScopes: {
        needPermission: 'canDeleteShelf'
      },
      args: {
        barcode: t.arg.string(),
      },
      validate: z.object({
        barcode: z.string().nonempty(),
      }),
      resolve: async (root, args, ctx: any) => {
        return await ctx.prisma.$transaction(async (tx: any) => {
          await deleteShelf(tx, args.barcode!, ctx.user);
          return true;
        });
      },
    }),
    restoreShelf: t.boolean({
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
        const parent = await ctx.prisma.shelf.findUnique({
          where: {barcode: args.barcode!},
          include: {storage: true}
        });
        if (parent.storage.deletedBy !== null) {
          throw new Error("You cannot add a shelf on a deleted storage")
        }
        return await ctx.prisma.$transaction(async (tx: any) => {
          await restoreLocation(tx, 'shelf', args.barcode!);
          return true;
        });
      },
    }),
  }),
});

async function createShelf (transaction: any, barcode: string, parent: {id: number}, user: UserInfo) {
  const lastNumber = await transaction.shelf.aggregate({where: {idStorage: parent.id}, _max: {numShelf: true}});
  const newNumber = lastNumber._max.numShelf ? lastNumber._max.numShelf + 1 : 1;
  return await transaction.shelf.create({
    data: {
      idStorage: parent.id,
      barcode: `${barcode} E${newNumber}`,
      numShelf: newNumber,
      createdBy: getUserString(user),
      createdOn: new Date(),
      rmmStatus: 'ToBeCreated'
    },
  });
}

async function deleteShelf (transaction: any, barcode: string, user: UserInfo) {
  const data = {
    deletedBy: getUserString(user),
    deletedOn: new Date(),
    rmmStatus: 'ToBeDeleted'
  };
  const shelf = await transaction.shelf.update({
    where: {
      barcode: barcode
    },
    data: data
  });
  await transaction.box.updateMany({
    where: {
      idShelf: shelf.id
    },
    data: data
  });
}

export async function getShelvesByRMMStatus (prisma: any, status: RMMCodeStatus) {
  return await prisma.shelf.findMany({
    where: {rmmStatus: status},
    include: {storage: {include: {roomType: true}}}
  });
}
