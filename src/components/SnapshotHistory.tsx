import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Trash2, GitCompare, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DiffViewer } from "./DiffViewer";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";


interface Snapshot {
  id: string;
  content_text: string;
  content_length: number;
  status_code: number;
  created_at: string;
  alert_triggered: string;
  change_percentage: number;
  resolved: boolean;
  pdf_file_path: string | null;
}

interface SnapshotHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  urlId: string;
  urlName: string;
}

const extractTextFromHtml = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || doc.body.innerText || '';
};

export const SnapshotHistory = ({ open, onOpenChange, urlId, urlName }: SnapshotHistoryProps) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshots, setSelectedSnapshots] = useState<string[]>([]);
  const [comparingSnapshots, setComparingSnapshots] = useState<[Snapshot, Snapshot] | null>(null);
  const { toast } = useToast();

  const loadSnapshots = async () => {
    if (!urlId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_snapshots')
        .select('*')
        .eq('monitored_url_id', urlId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSnapshots(data || []);
    } catch (error) {
      console.error('Error loading snapshots:', error);
      toast({
        title: "Error",
        description: "Failed to load snapshot history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getFileUrl = (filePath: string | null) => {
    if (!filePath) return null;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/content-pdfs/${filePath}`;
  };

  const handleViewFile = async (filePath: string | null) => {
    if (!filePath) return;
    
    try {
      const url = getFileUrl(filePath);
      if (!url) return;
      
      // Fetch the file
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch file');
      }
      
      const arrayBuffer = await response.arrayBuffer();
      
      // Force PDF content type for .pdf files
      const contentType = filePath.endsWith('.pdf') ? 'application/pdf' : 'text/html';
      
      // Create a blob with explicit content type
      const blob = new Blob([arrayBuffer], { type: contentType });
      
      // Create object URL
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a temporary link and click it to trigger download/view with correct type
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // This helps the browser recognize it as PDF
      if (contentType === 'application/pdf') {
        link.type = 'application/pdf';
      }
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      console.error('Error viewing file:', error);
      toast({
        title: "Error",
        description: "Could not open the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (open && urlId) {
      loadSnapshots();
      setSelectedSnapshots([]);
      setComparingSnapshots(null);
    }
  }, [open, urlId]);

  const handleDelete = async (snapshotId: string) => {
    try {
      const { error } = await supabase
        .from('content_snapshots')
        .delete()
        .eq('id', snapshotId);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Snapshot has been discarded",
      });

      loadSnapshots();
    } catch (error) {
      console.error('Error deleting snapshot:', error);
      toast({
        title: "Error",
        description: "Failed to delete snapshot",
        variant: "destructive",
      });
    }
  };

  const handleSelectSnapshot = (snapshotId: string) => {
    setSelectedSnapshots(prev => {
      if (prev.includes(snapshotId)) {
        return prev.filter(id => id !== snapshotId);
      }
      if (prev.length >= 2) {
        return [prev[1], snapshotId];
      }
      return [...prev, snapshotId];
    });
  };

  const handleCompare = () => {
    if (selectedSnapshots.length !== 2) return;
    
    const snapshot1 = snapshots.find(s => s.id === selectedSnapshots[0]);
    const snapshot2 = snapshots.find(s => s.id === selectedSnapshots[1]);
    
    if (snapshot1 && snapshot2) {
      // Sort by date to ensure older is first
      const sorted = [snapshot1, snapshot2].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setComparingSnapshots([sorted[0], sorted[1]]);
    }
  };

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

  if (comparingSnapshots) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Comparing Snapshots: {urlName}</DialogTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setComparingSnapshots(null)}
              >
                Back to History
              </Button>
            </div>
            <DialogDescription>
              <div className="flex gap-4 mt-2">
                <div>
                  <span className="text-muted-foreground">From: </span>
                  {formatDistanceToNow(new Date(comparingSnapshots[0].created_at), { addSuffix: true })}
                </div>
                <div>
                  <span className="text-muted-foreground">To: </span>
                  {formatDistanceToNow(new Date(comparingSnapshots[1].created_at), { addSuffix: true })}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
            <DiffViewer 
              oldText={extractTextFromHtml(comparingSnapshots[0].content_text || '')}
              newText={extractTextFromHtml(comparingSnapshots[1].content_text || '')}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Snapshot History: {urlName}</DialogTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={handleCompare}
                disabled={selectedSnapshots.length !== 2}
              >
                <GitCompare className="h-4 w-4 mr-1" />
                Compare Selected
              </Button>
            </div>
          </div>
          <DialogDescription>
            Select two snapshots to compare changes between versions
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] w-full">
          {loading ? (
            <div className="text-center py-8">Loading snapshots...</div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No snapshots found
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {snapshots.map((snapshot) => (
                <Card key={snapshot.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedSnapshots.includes(snapshot.id)}
                      onCheckedChange={() => handleSelectSnapshot(snapshot.id)}
                      disabled={
                        selectedSnapshots.length >= 2 && 
                        !selectedSnapshots.includes(snapshot.id)
                      }
                    />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
                        </span>
                        <Badge variant={getAlertColor(snapshot.alert_triggered)}>
                          {snapshot.alert_triggered.toUpperCase()}
                        </Badge>
                        {snapshot.resolved && (
                          <Badge variant="outline">Resolved</Badge>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Status: {snapshot.status_code}</span>
                        <span>Size: {snapshot.content_length.toLocaleString()} chars</span>
                        {snapshot.change_percentage > 0 && (
                          <span>Change: {(snapshot.change_percentage * 100).toFixed(1)}%</span>
                        )}
                      </div>
                      {snapshot.pdf_file_path && (
                        <div className="mt-1">
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => handleViewFile(snapshot.pdf_file_path)}
                            className="h-auto p-0 text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Captured File
                          </Button>
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(snapshot.id)}
                      title="Discard snapshot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
