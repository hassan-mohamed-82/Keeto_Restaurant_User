import { db } from "./src/models/connection";
import { food } from "./src/models/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        const id = "e242a04a-ed74-4973-8a8d-537638e1d27b"; // the food item the user provided
        
        // Let's see what's currently in the DB
        const f = await db.select().from(food).where(eq(food.id, id));
        console.log("Current addonsId in DB:", typeof f[0].addonsId, f[0].addonsId);
        
        console.log("Done");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
