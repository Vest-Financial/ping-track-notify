import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { UrlList } from "@/components/UrlList";
import { AddUrlDialog } from "@/components/AddUrlDialog";

const Index = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            URL Monitor
          </h1>
          <p className="text-muted-foreground">
            Track website changes and get alerted when content is modified
          </p>
        </header>

        <div className="mb-6">
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            size="lg"
            className="gap-2"
          >
            <Plus className="h-5 w-5" />
            Add URL to Monitor
          </Button>
        </div>

        <UrlList key={refreshTrigger} />

        <AddUrlDialog 
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onUrlAdded={() => setRefreshTrigger(prev => prev + 1)}
        />
      </div>
    </div>
  );
};

export default Index;
