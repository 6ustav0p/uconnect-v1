import mongoose from "mongoose";
import { config } from "../config";
import { logger } from "../utils";

class DatabaseService {
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug("MongoDB ya está conectado");
      return;
    }

    try {
      mongoose.set("strictQuery", true);

      await mongoose.connect(config.mongodb.uri, {
        dbName: config.mongodb.dbName,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      logger.info("MongoDB conectado exitosamente", {
        db: config.mongodb.dbName,
      });

      // Manejar eventos de conexión
      mongoose.connection.on("error", (err) => {
        logger.error("Error de conexión MongoDB", { error: err.message });
      });

      mongoose.connection.on("disconnected", () => {
        this.isConnected = false;
        logger.warn("MongoDB desconectado");
      });

      mongoose.connection.on("reconnected", () => {
        this.isConnected = true;
        logger.info("MongoDB reconectado");
      });
    } catch (error) {
      this.isConnected = false;
      logger.error("Error conectando a MongoDB", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info("MongoDB desconectado correctamente");
    } catch (error) {
      logger.error("Error desconectando MongoDB", {
        error: (error as Error).message,
      });
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

export const database = new DatabaseService();
