import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import {
  Plus,
  Ban,
  Trash2,
  Loader2,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

interface IPRule {
  id: string;
  ip_address: string;
  rule_type: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
}

interface LoginAttempt {
  id: string;
  login: string;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const IPManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [ipRules, setIPRules] = useState<IPRule[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"blocked" | "attempts">("blocked");
  
  const [formData, setFormData] = useState({
    ip_address: "",
    reason: "",
    expires_in: "0", // 0 = permanent, others in minutes
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const token = getToken();
      
      // Fetch blocked IPs
      const ipResponse = await fetch(`${SUPABASE_URL}/functions/v1/auth/list-blocked-ips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      
      const ipData = await ipResponse.json();
      if (ipData.success) {
        setIPRules(ipData.data || []);
      }

      // Fetch login attempts
      const attemptsResponse = await fetch(`${SUPABASE_URL}/functions/v1/auth/login-attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      
      const attemptsData = await attemptsResponse.json();
      if (attemptsData.success) {
        setLoginAttempts(attemptsData.data || []);
      }
    } catch (error) {
      toast({
        title: "Xatolik",
        description: "Ma'lumotlarni yuklashda xatolik",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlockIP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(formData.ip_address)) {
      toast({
        title: "Xatolik",
        description: "Noto'g'ri IP manzil formati",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const token = getToken();
      const expiresIn = parseInt(formData.expires_in);
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/auth/block-ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          targetIP: formData.ip_address,
          reason: formData.reason || "Admin tomonidan bloklangan",
          expiresIn: expiresIn > 0 ? expiresIn : null,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Muvaffaqiyat",
          description: `IP ${formData.ip_address} bloklandi`,
        });
        setIsDialogOpen(false);
        setFormData({ ip_address: "", reason: "", expires_in: "0" });
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Xatolik",
        description: error.message || "IP bloklashda xatolik",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnblockIP = async (ipAddress: string) => {
    if (!confirm(`${ipAddress} ni blokdan chiqarishni xohlaysizmi?`)) return;

    try {
      const token = getToken();
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/auth/unblock-ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, targetIP: ipAddress }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Muvaffaqiyat",
          description: `IP ${ipAddress} blokdan chiqarildi`,
        });
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Xatolik",
        description: error.message || "Blokdan chiqarishda xatolik",
        variant: "destructive",
      });
    }
  };

  const blockIPFromAttempt = (ipAddress: string) => {
    setFormData({
      ip_address: ipAddress,
      reason: "Shubhali login urinishlari",
      expires_in: "1440", // 24 hours
    });
    setIsDialogOpen(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">IP Boshqaruvi</h1>
            <p className="text-muted-foreground">
              Bloklangan IP'lar va login urinishlarini boshqaring
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Yangilash
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  IP bloklash
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yangi IP bloklash</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleBlockIP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ip_address">IP manzil</Label>
                    <Input
                      id="ip_address"
                      value={formData.ip_address}
                      onChange={(e) =>
                        setFormData({ ...formData, ip_address: e.target.value })
                      }
                      placeholder="192.168.1.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Sabab</Label>
                    <Input
                      id="reason"
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                      }
                      placeholder="Bloklash sababi"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expires_in">Muddati</Label>
                    <Select
                      value={formData.expires_in}
                      onValueChange={(value) =>
                        setFormData({ ...formData, expires_in: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Doimiy</SelectItem>
                        <SelectItem value="15">15 daqiqa</SelectItem>
                        <SelectItem value="60">1 soat</SelectItem>
                        <SelectItem value="1440">24 soat</SelectItem>
                        <SelectItem value="10080">7 kun</SelectItem>
                        <SelectItem value="43200">30 kun</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Bekor qilish
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Ban className="w-4 h-4 mr-2" />
                          Bloklash
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab("blocked")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "blocked"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            Bloklangan IP'lar ({ipRules.length})
          </button>
          <button
            onClick={() => setActiveTab("attempts")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "attempts"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            Login urinishlari ({loginAttempts.length})
          </button>
        </div>

        {/* Content */}
        <div className="cyber-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : activeTab === "blocked" ? (
            ipRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Shield className="w-12 h-12 mb-4 opacity-50" />
                <p>Bloklangan IP'lar yo'q</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP manzil</TableHead>
                    <TableHead>Sabab</TableHead>
                    <TableHead>Muddati</TableHead>
                    <TableHead>Yaratilgan</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ipRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-mono font-medium">
                        {rule.ip_address}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rule.reason || "-"}
                      </TableCell>
                      <TableCell>
                        {rule.expires_at ? (
                          <span className="text-warning">
                            {format(new Date(rule.expires_at), "dd.MM.yyyy HH:mm")}
                          </span>
                        ) : (
                          <span className="text-destructive font-medium">Doimiy</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(rule.created_at), "dd.MM.yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnblockIP(rule.ip_address)}
                          className="text-success hover:text-success hover:bg-success/10"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Blokdan chiqarish
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : (
            loginAttempts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mb-4 opacity-50" />
                <p>Login urinishlari yo'q</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Login</TableHead>
                    <TableHead>IP manzil</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Vaqt</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-mono font-medium">
                        {attempt.login}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {attempt.ip_address || "Noma'lum"}
                      </TableCell>
                      <TableCell>
                        {attempt.success ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-success/15 text-success">
                            <CheckCircle className="w-3 h-3" />
                            Muvaffaqiyatli
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/15 text-destructive">
                            <AlertTriangle className="w-3 h-3" />
                            Muvaffaqiyatsiz
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(attempt.created_at), "dd.MM.yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-right">
                        {!attempt.success && attempt.ip_address && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => blockIPFromAttempt(attempt.ip_address!)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Ban className="w-4 h-4 mr-1" />
                            IP bloklash
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default IPManagement;
