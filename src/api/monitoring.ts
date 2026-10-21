import express from "express";
import {Request} from "express";

export function makeRESTHealthAPI() {
	const app = express();

	app.get("/",
		async (req: Request, res) => {
			res.json({status: "up"});
		});

	return app;
}
