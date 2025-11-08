import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Trash2, ExternalLink, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface MonitoredUrl {
  id: string;
  url: string;
  name: string | null;
  check_frequency_hours: number;
  last_checked_at: string | null;
  is_active: boolean;
  yellow_threshold: number;
  red_threshold: number;
  created_at: string;
}

interface LatestSnapshot {
  alert_triggered: string;
  change_percentage: number;
  created_at: string;
}

export const UrlList = () => {
  const [urls, setUrls] = useState<MonitoredUrl[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, LatestSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadUrls = async () => {
    try {
      const { data, error } = await supabase
        .from("monitored_urls")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUrls(data || []);

      // Load latest snapshots for each URL
      if (data) {
        for (const url of data) {
          const { data: snapshotData } = await supabase
            .from("content_snapshots")
            .select("alert_triggered, change_percentage, created_at")
            .eq("monitored_url_id", url.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (snapshotData) {
            setSnapshots(prev => ({ ...prev, [url.id]: snapshotData }));
          }
        }
      }
    } catch (error) {
      console.error("Error loading URLs:", error);
      toast({
        title: "Error",
        description: "Failed to load monitored URLs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUrls();

    // Subscribe to changes
    const channel = supabase
      .channel("monitored_urls_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monitored_urls" },
        () => loadUrls()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCheckNow = async (urlId: string) => {
    setCheckingId(urlId);
    try {
      const { data, error } = await supabase.functions.invoke("check-url", {
        body: { urlId },
      });

      if (error) throw error;

      toast({
        title: "Check Complete",
        description: `Alert Level: ${data.alertLevel.toUpperCase()}`,
      });

      loadUrls();
    } catch (error) {
      console.error("Error checking URL:", error);
      toast({
        title: "Error",
        description: "Failed to check URL",
        variant: "destructive",
      });
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (urlId: string) => {
    try {
      const { error } = await supabase
        .from("monitored_urls")
        .delete()
        .eq("id", urlId);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "URL removed from monitoring",
      });
    } catch (error) {
      console.error("Error deleting URL:", error);
      toast({
        title: "Error",
        description: "Failed to delete URL",
        variant: "destructive",
      });
    }
  };

  const getAlertBadge = (urlId: string) => {
    const snapshot = snapshots[urlId];
    if (!snapshot) return null;

    const variant = snapshot.alert_triggered === "red" 
      ? "destructive" 
      : snapshot.alert_triggered === "yellow" 
      ? "default" 
      : "secondary";

    return (
      <Badge variant={variant} className="gap-1">
        <AlertCircle className="h-3 w-3" />
        {snapshot.alert_triggered.toUpperCase()}
        {snapshot.change_percentage > 0 && (
          <span className="ml-1">
            ({(snapshot.change_percentage * 100).toFixed(1)}%)
          </span>
        )}
      </Badge>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (urls.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No URLs being monitored yet. Add one to get started!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {urls.map((url) => (
        <Card key={url.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  {url.name || "Unnamed URL"}
                  {getAlertBadge(url.id)}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <a
                    href={url.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    {url.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCheckNow(url.id)}
                  disabled={checkingId === url.id}
                >
                  <RefreshCw className={`h-4 w-4 ${checkingId === url.id ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(url.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Check Frequency</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Every {url.check_frequency_hours}h
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Checked</p>
                <p className="font-medium">
                  {url.last_checked_at
                    ? formatDistanceToNow(new Date(url.last_checked_at), {
                        addSuffix: true,
                      })
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Thresholds</p>
                <p className="font-medium">
                  Yellow: {url.yellow_threshold * 100}% / Red: {url.red_threshold * 100}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant={url.is_active ? "default" : "secondary"}>
                  {url.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};