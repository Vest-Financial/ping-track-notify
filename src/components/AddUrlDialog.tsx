import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AddUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddUrlDialog = ({ open, onOpenChange }: AddUrlDialogProps) => {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [checkFrequency, setCheckFrequency] = useState("168");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookPayload, setWebhookPayload] = useState("");
  const [yellowThreshold, setYellowThreshold] = useState("0.3");
  const [redThreshold, setRedThreshold] = useState("0.5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let parsedPayload = null;
      if (webhookPayload) {
        try {
          parsedPayload = JSON.parse(webhookPayload);
        } catch {
          toast({
            title: "Invalid JSON",
            description: "Webhook payload must be valid JSON",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      const { error } = await supabase.from("monitored_urls").insert({
        url,
        name: name || null,
        check_frequency_hours: parseInt(checkFrequency),
        alert_webhook_url: webhookUrl || null,
        alert_webhook_payload: parsedPayload,
        yellow_threshold: parseFloat(yellowThreshold),
        red_threshold: parseFloat(redThreshold),
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "URL added to monitoring",
      });

      // Reset form
      setUrl("");
      setName("");
      setCheckFrequency("168");
      setWebhookUrl("");
      setWebhookPayload("");
      setYellowThreshold("0.3");
      setRedThreshold("0.5");
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding URL:", error);
      toast({
        title: "Error",
        description: "Failed to add URL",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add URL to Monitor</DialogTitle>
          <DialogDescription>
            Configure a URL to monitor for content changes
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Website"
            />
          </div>

          <div>
            <Label htmlFor="frequency">Check Frequency (hours)</Label>
            <Input
              id="frequency"
              type="number"
              value={checkFrequency}
              onChange={(e) => setCheckFrequency(e.target.value)}
              min="1"
              required
            />
            <p className="text-sm text-muted-foreground mt-1">
              Default: 168 hours (1 week)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="yellow">Yellow Alert Threshold</Label>
              <Input
                id="yellow"
                type="number"
                step="0.01"
                value={yellowThreshold}
                onChange={(e) => setYellowThreshold(e.target.value)}
                min="0"
                max="1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                0.3 = 30% change
              </p>
            </div>

            <div>
              <Label htmlFor="red">Red Alert Threshold</Label>
              <Input
                id="red"
                type="number"
                step="0.01"
                value={redThreshold}
                onChange={(e) => setRedThreshold(e.target.value)}
                min="0"
                max="1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                0.5 = 50% change
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="webhook">Alert Webhook URL (optional)</Label>
            <Input
              id="webhook"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://api.example.com/alerts"
            />
          </div>

          <div>
            <Label htmlFor="payload">Webhook Payload (JSON, optional)</Label>
            <Textarea
              id="payload"
              value={webhookPayload}
              onChange={(e) => setWebhookPayload(e.target.value)}
              placeholder='{"channel": "#alerts", "priority": "high"}'
              rows={4}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add URL"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};