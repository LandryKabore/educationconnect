import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Send, MessageCircle } from "lucide-react";
import { useMessages } from "@/hooks/useMessages";
import { Badge } from "@/components/ui/badge";

interface MessagesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedUserId?: string;
  preselectedUserName?: string;
}

export const MessagesModal = ({
  open,
  onOpenChange,
  preselectedUserId,
  preselectedUserName,
}: MessagesModalProps) => {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [messageSubject, setMessageSubject] = useState("");

  const {
    loading,
    conversations,
    currentConversation,
    currentUserId,
    fetchConversationWith,
    sendMessage,
  } = useMessages();

  // Auto-select and fetch conversation if preselectedUserId is provided
  useEffect(() => {
    if (preselectedUserId && open) {
      handleSelectConversation(preselectedUserId);
    }
  }, [preselectedUserId, open]);

  const handleSelectConversation = async (userId: string) => {
    setSelectedConversation(userId);
    await fetchConversationWith(userId);
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageBody.trim()) return;

    await sendMessage(selectedConversation, messageSubject || null, messageBody);
    setMessageBody("");
    setMessageSubject("");
  };

  const handleBack = () => {
    setSelectedConversation(null);
    setMessageSubject("");
    setMessageBody("");
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length >= 2 
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "teacher":
        return "bg-blue-500";
      case "student":
        return "bg-green-500";
      case "parent":
        return "bg-purple-500";
      default:
        return "bg-slate-500";
    }
  };

  const selectedConv = conversations.find((c) => c.user_id === selectedConversation);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] bg-slate-800 border-slate-600 p-0">
        <div className="flex h-full">
          {/* Conversations List */}
          {!selectedConversation && (
            <div className="w-full flex flex-col">
              <DialogHeader className="p-6 border-b border-slate-600">
                <DialogTitle className="text-white flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Messages
                </DialogTitle>
                <DialogDescription className="text-slate-300">
                  Select a conversation to view messages
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="p-6 text-center text-slate-400">Loading...</div>
                ) : conversations.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    No conversations yet
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {conversations.map((conv) => (
                      <div
                        key={conv.user_id}
                        onClick={() => handleSelectConversation(conv.user_id)}
                        className="p-4 bg-slate-700/50 rounded-lg hover:bg-slate-700 cursor-pointer transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500">
                            <AvatarFallback className="text-white bg-transparent">
                              {getInitials(conv.user_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-white truncate">
                                  {conv.user_name}
                                </h4>
                                <Badge
                                  className={`${getRoleBadgeColor(conv.user_role)} text-white text-xs`}
                                >
                                  {conv.user_role}
                                </Badge>
                              </div>
                              {conv.unread_count > 0 && (
                                <Badge className="bg-orange-500 text-white">
                                  {conv.unread_count}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-400 truncate mt-1">
                              {conv.last_message}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {new Date(conv.last_message_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Message Thread */}
          {selectedConversation && (
            <div className="w-full flex flex-col">
              <DialogHeader className="p-6 border-b border-slate-600">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleBack}
                    className="text-white hover:bg-slate-700"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500">
                      <AvatarFallback className="text-white bg-transparent">
                        {getInitials(selectedConv?.user_name || preselectedUserName || "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="text-white">
                        {selectedConv?.user_name || preselectedUserName}
                      </DialogTitle>
                      {selectedConv && (
                        <Badge
                          className={`${getRoleBadgeColor(selectedConv.user_role)} text-white text-xs`}
                        >
                          {selectedConv.user_role}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Messages */}
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                  {currentConversation.map((message) => {
                    const isSent = message.sender_user_id === currentUserId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isSent ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] p-4 rounded-lg ${
                            isSent
                              ? "bg-gradient-to-r from-orange-500 to-red-500 text-white"
                              : "bg-slate-700 text-white"
                          }`}
                        >
                          {message.subject && (
                            <p className="font-semibold mb-2">{message.subject}</p>
                          )}
                          <p className="text-sm">{message.body}</p>
                          <p className={`text-xs mt-2 ${isSent ? "text-white/70" : "text-slate-400"}`}>
                            {new Date(message.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Send Message */}
              <div className="p-6 border-t border-slate-600">
                <div className="space-y-3">
                  <Input
                    placeholder="Subject (optional)"
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  />
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your message..."
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 resize-none"
                      rows={3}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageBody.trim()}
                      className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
