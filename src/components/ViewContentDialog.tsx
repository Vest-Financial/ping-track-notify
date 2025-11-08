import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Code, Eye } from "lucide-react";

interface ViewContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: {
    content_text: string;
    content_length: number;
    status_code: number;
    created_at: string;
    alert_triggered: string;
    change_percentage: number;
  } | null;
  urlName: string;
}

export const ViewContentDialog = ({ open, onOpenChange, snapshot, urlName }: ViewContentDialogProps) => {
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  
  if (!snapshot) return null;

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'red':
        return 'destructive';
      case 'yellow':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              Latest Content: {urlName}
            </DialogTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === "rendered" ? "default" : "outline"}
                onClick={() => setViewMode("rendered")}
              >
                <Eye className="h-4 w-4 mr-1" />
                Rendered
              </Button>
              <Button
                size="sm"
                variant={viewMode === "raw" ? "default" : "outline"}
                onClick={() => setViewMode("raw")}
              >
                <Code className="h-4 w-4 mr-1" />
                Raw
              </Button>
            </div>
          </div>
          <DialogDescription className="flex items-center gap-4 flex-wrap">
            <span>
              Captured {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
            </span>
            <Badge variant={getAlertColor(snapshot.alert_triggered)}>
              {snapshot.alert_triggered.toUpperCase()}
            </Badge>
            <span className="text-muted-foreground">
              Status: {snapshot.status_code}
            </span>
            <span className="text-muted-foreground">
              Size: {snapshot.content_length.toLocaleString()} chars
            </span>
            {snapshot.change_percentage > 0 && (
              <span className="text-muted-foreground">
                Change: {(snapshot.change_percentage * 100).toFixed(1)}%
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {viewMode === "rendered" ? (
          <div className="h-[60vh] w-full rounded-md border bg-white">
            <iframe
              srcDoc={snapshot.content_text || '<p>No content available</p>'}
              className="w-full h-full rounded-md"
              sandbox="allow-same-origin"
              title="Rendered content"
            />
          </div>
        ) : (
          <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
            <pre className="text-sm whitespace-pre-wrap break-words">
              {snapshot.content_text || 'No content available'}
            </pre>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};