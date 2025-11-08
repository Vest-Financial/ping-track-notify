import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Code, FileText, GitCompare, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DiffViewer } from "./DiffViewer";
import { useToast } from "@/hooks/use-toast";

// Helper function to extract text from HTML
const extractTextFromHtml = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || doc.body.innerText || '';
};

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

interface FullSnapshot {
  id: string;
  monitored_url_id: string;
  content_text: string;
  content_length: number;
  status_code: number;
  created_at: string;
  alert_triggered: string;
  change_percentage: number;
  resolved: boolean;
  resolved_at: string | null;
}

export const ViewContentDialog = ({ open, onOpenChange, snapshot, urlName }: ViewContentDialogProps) => {
  const [viewMode, setViewMode] = useState<"text" | "raw" | "diff">("text");
  const [fullSnapshot, setFullSnapshot] = useState<FullSnapshot | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<FullSnapshot | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    const fetchSnapshots = async () => {
      if (!snapshot) return;
      
      // Get the full current snapshot first
      const { data: currentData } = await supabase
        .from('content_snapshots')
        .select('*')
        .eq('created_at', snapshot.created_at)
        .maybeSingle();
      
      if (currentData) {
        setFullSnapshot(currentData);
        
        // Then get previous snapshot
        const { data: prevData } = await supabase
          .from('content_snapshots')
          .select('*')
          .eq('monitored_url_id', currentData.monitored_url_id)
          .lt('created_at', currentData.created_at)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        setPreviousSnapshot(prevData);
      }
    };

    if (open && snapshot) {
      fetchSnapshots();
    }
  }, [open, snapshot]);

  const handleResolve = async () => {
    if (!fullSnapshot) return;
    
    setIsResolving(true);
    try {
      const { error } = await supabase
        .from('content_snapshots')
        .update({ 
          resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', fullSnapshot.id);

      if (error) throw error;

      toast({
        title: "Alert resolved",
        description: "This alert has been marked as resolved.",
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast({
        title: "Error",
        description: "Failed to resolve alert. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResolving(false);
    }
  };
  
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
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={viewMode === "text" ? "default" : "outline"}
                onClick={() => setViewMode("text")}
              >
                <FileText className="h-4 w-4 mr-1" />
                Text
              </Button>
              <Button
                size="sm"
                variant={viewMode === "raw" ? "default" : "outline"}
                onClick={() => setViewMode("raw")}
              >
                <Code className="h-4 w-4 mr-1" />
                Raw HTML
              </Button>
              {previousSnapshot && (
                <Button
                  size="sm"
                  variant={viewMode === "diff" ? "default" : "outline"}
                  onClick={() => setViewMode("diff")}
                >
                  <GitCompare className="h-4 w-4 mr-1" />
                  Changes
                </Button>
              )}
              {(snapshot.alert_triggered === 'yellow' || snapshot.alert_triggered === 'red') && fullSnapshot && !fullSnapshot.resolved && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResolve}
                  disabled={isResolving}
                  className="ml-auto"
                >
                  <Check className="h-4 w-4 mr-1" />
                  {isResolving ? 'Resolving...' : 'Resolve Alert'}
                </Button>
              )}
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

        <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
          {viewMode === "text" ? (
            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {extractTextFromHtml(snapshot.content_text || 'No content available')}
            </div>
          ) : viewMode === "diff" && previousSnapshot ? (
            <div className="text-sm">
              <div className="mb-4 p-3 bg-muted rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Comparing with previous snapshot from:</p>
                <p className="text-sm font-medium">
                  {formatDistanceToNow(new Date(previousSnapshot.created_at), { addSuffix: true })}
                </p>
              </div>
              <DiffViewer 
                oldText={extractTextFromHtml(previousSnapshot.content_text || '')}
                newText={extractTextFromHtml(snapshot.content_text || '')}
              />
            </div>
          ) : (
            <pre className="text-sm whitespace-pre-wrap break-words">
              {snapshot.content_text || 'No content available'}
            </pre>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
