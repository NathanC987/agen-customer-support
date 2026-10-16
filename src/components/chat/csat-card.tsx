"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { submitCsat } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const LABELS = ["", "Very poor", "Poor", "Okay", "Good", "Excellent"];

export function CsatCard({ conversationId, existing, onSubmitted }: { conversationId: string; existing: { rating: number } | null; onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  if (existing) {
    return (
      <div className="mx-auto flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        <span className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-3.5", n <= existing.rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />
          ))}
        </span>
        Thanks for your feedback!
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-center text-sm font-medium">How did we do?</p>
      <p className="text-center text-xs text-muted-foreground">Rate your support experience</p>
      <div className="mt-3 flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} stars`} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className="rounded-md p-1 transition-transform hover:scale-110">
            <Star className={cn("size-6 transition-colors", n <= shown ? "fill-warning text-warning" : "text-muted-foreground/30")} />
          </button>
        ))}
      </div>
      <p className="h-4 text-center text-xs text-muted-foreground">{LABELS[shown]}</p>
      {rating > 0 && (
        <div className="mt-2 space-y-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything we could do better? (optional)" className="min-h-16 resize-none text-sm" />
          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await submitCsat(conversationId, rating, comment || null);
                if (res.ok) onSubmitted();
                else toast.error(res.error);
              })
            }
          >
            Submit feedback
          </Button>
        </div>
      )}
    </div>
  );
}
