"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2Icon, ChevronDownIcon } from "lucide-react";
import {
  useAiSettings,
  useAiModels,
  useUpdateAiSettings,
  useTestAiConnection,
} from "@/hooks/use-ai-settings";

const AUTO_VALUE = "__auto__";

export function AiSettings() {
  const settingsQuery = useAiSettings();
  const modelsQuery = useAiModels();
  const updateSettings = useUpdateAiSettings();
  const testConnection = useTestAiConnection();

  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState<string>(AUTO_VALUE);

  useEffect(() => {
    if (settingsQuery.data) {
      setEndpoint(settingsQuery.data.endpoint);
      setModel(settingsQuery.data.model ?? AUTO_VALUE);
    }
  }, [settingsQuery.data]);

  const dirty =
    !!settingsQuery.data &&
    (endpoint !== settingsQuery.data.endpoint ||
      model !== (settingsQuery.data.model ?? AUTO_VALUE));

  const health = settingsQuery.data?.health;

  function handleSave() {
    updateSettings.mutate({
      endpoint,
      model: model === AUTO_VALUE ? null : model,
    });
  }

  const selectedModel = modelsQuery.data?.models.find((m) => m.id === model);
  const selectedModelLabel =
    model === AUTO_VALUE
      ? "Auto-select largest"
      : selectedModel
        ? `${selectedModel.name}${selectedModel.size ? ` (${selectedModel.size})` : ""}`
        : model;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
        <CardDescription>
          Configure the Ollama server used for document import. Your data stays
          on this server — nothing is sent to external services.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ai-endpoint">Endpoint</Label>
              <Input
                id="ai-endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://192.168.1.250:11434"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Model</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal"
                    />
                  }
                >
                  <span>{selectedModelLabel}</span>
                  <ChevronDownIcon className="size-4 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuRadioGroup
                    value={model}
                    onValueChange={setModel}
                  >
                    <DropdownMenuRadioItem value={AUTO_VALUE}>
                      Auto-select largest
                    </DropdownMenuRadioItem>
                    {modelsQuery.data?.models.map((m) => (
                      <DropdownMenuRadioItem key={m.id} value={m.id}>
                        {m.name}
                        {m.size ? ` (${m.size})` : ""}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span
                className={`size-2 rounded-full ${
                  health?.ok ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span>
                {health?.ok
                  ? `Connected — ${health.model}`
                  : (health?.error ?? "Not connected")}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending}
              >
                {testConnection.isPending ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin mr-2" />
                    Testing...
                  </>
                ) : (
                  "Test connection"
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || updateSettings.isPending}
              >
                {updateSettings.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
