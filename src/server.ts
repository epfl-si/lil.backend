import express from "express";
import {ApolloServer} from "@apollo/server";
import {schema} from "./schema/schema";
import {expressMiddleware} from "@as-integrations/express5";
import {formatPrismaError} from "./lib/errors";
import {authenticateFromBearerToken} from "./lib/authentication";
import { Request } from "express-serve-static-core";
import { ParsedQs } from "qs";
import cors from 'cors';
import {getPrismaForUser} from "./lib/auditablePrisma";
import {makeRESTHealthAPI} from "./api/monitoring";

export async function makeServer() {
  const app = express();

  const server = new ApolloServer({
    schema,
    formatError(formattedError, error: any) {
      console.error('Server error:', error, error.originalError);
      const {errorCode, errorMessage} = formatPrismaError(formattedError, error);
      return {extensions: {code: errorCode}, message: errorMessage};
    }
  });
  await server.start();

  app.use(express.json());
  app.use(cors());
  app.use('/graphql',
    expressMiddleware(server, {
      context: async ({req}) => {
        const user = await authenticate(req);
        const prisma = getPrismaForUser(user);
        return {prisma, user};
      }
    }));

  app.use("/health", makeRESTHealthAPI());

  async function authenticate(req: Request<{}, any, any, ParsedQs, Record<string, any>>) {
    return await authenticateFromBearerToken(req);
  }

  return app;
}
