import dotenv from "dotenv";
import path from "path";
// Import reflect-metadata npm package necessary for class-transformer and routing-controller to function
import "reflect-metadata";
import { createExpressServer } from "routing-controllers";
import { AppController } from "./controllers/AppController";
import winston from "winston";
import { Container } from "typedi";
import { setupTypeORM } from "./typeORMLoader";
import { useContainer } from "typeorm";
import { RippleLibService } from "./services/RippleLibService";
import express from 'express';

// Set up the typeorm and typedi integration
useContainer(Container);

// Create a basic logger that logs to console
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console()
      ]
});

// Initialise the dotenv environment
dotenv.config();

// creates express app, registers all controller routes and returns express app instance
const app = createExpressServer({
    controllers: [AppController] // we specify controllers we want to use
});
const port = process.env.PORT || 8080; // get port from env, otherwise take default

// Initialise the ripple-lib service
Container.get(RippleLibService).init().then(() => {
    logger.info("Connected to ripple");
}).catch(() => {
    logger.error("Connecting to ripple failed");
    process.exit(0);
});

// Configure Express to use EJS
app.set( "views", path.join( __dirname, "views" ) );
app.set( "view engine", "ejs" );
app.use("/assets", express.static(path.join(__dirname, "assets")));

// run express application when database has connected succesfully
setupTypeORM().then(() => {
    app.listen(port, () => {
        logger.info("App started, listening on port " + port);
    });
}).catch(() => {
    logger.error("Database connection failed, exiting application...");
    process.exit(0);
});