DROP INDEX "message_ratings_chatbot_id_created_at_idx";--> statement-breakpoint
CREATE INDEX "message_ratings_chatbot_id_updated_at_idx" ON "message_ratings" USING btree ("chatbot_id","updated_at");--> statement-breakpoint
ALTER TABLE "message_ratings" ADD CONSTRAINT "message_ratings_rating_check" CHECK ("message_ratings"."rating" IN (1, -1));