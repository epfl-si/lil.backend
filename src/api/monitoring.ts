import express from "express";
import {Request} from "express";

export function makeRESTHealthAPI() {
	const app = express();

	app.get("/",
		async (req: Request, res) => {
			res.json({Message: "Server up"});
		});

	return app;
}
