import React, { useState } from 'react';
import { X, Plus, Trash2, UserPlus, CheckCircle2, Users } from 'lucide-react';
import { SmartSettlement, SettlementMember } from '../../domain/settlementTypes';
import { repository } from '../../data/repository';

interface CreateSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (settlement: SmartSettlement) => void;
  currentUserName?: string;
}

export const CreateSettlementModal: React.FC<CreateSettlementModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  currentUserName = 'You'
}) => {
  const defaultSeq = repository.getNextSettlementSequentialNumber();
  const defaultName = repository.formatSettlementDefaultName(defaultSeq);

  const [name, setName] = useState<string>(defaultName);
  const [members, setMembers] = useState<SettlementMember[]>([
    {
      id: `mem_me_${Date.now()}`,
      name: currentUserName || 'You',
      isMe: true
    },
    {
      id: `mem_p2_${Date.now() + 1}`,
      name: 'Member 2'
    }
  ]);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleAddMember = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    if (members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`Member "${trimmed}" already exists.`);
      return;
    }
    setError('');
    setMembers([
      ...members,
      {
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: trimmed
      }
    ]);
    setNewMemberName('');
  };

  const handleRemoveMember = (id: string) => {
    if (members.length <= 2) {
      setError('A settlement requires at least 2 members.');
      return;
    }
    setError('');
    setMembers(members.filter((m) => m.id !== id));
  };

  const handleUpdateMemberName = (id: string, newName: string) => {
    setMembers(members.map((m) => (m.id === id ? { ...m, name: newName } : m)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || defaultName;
    if (members.length < 2) {
      setError('At least 2 members are required.');
      return;
    }
    // Check if any member has empty name
    if (members.some((m) => !m.name.trim())) {
      setError('All members must have a valid name.');
      return;
    }

    const newSettlement: SmartSettlement = {
      id: `settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: finalName,
      currencySymbol: '৳',
      sequentialNumber: defaultSeq,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      members: members.map((m) => ({ ...m, name: m.name.trim() })),
      expenses: [],
      payments: [],
      refunds: []
    };

    await repository.saveSmartSettlement(newSettlement);
    onCreated(newSettlement);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#1A1C20] border border-[#3D4943]/60 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D4943]/40 bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#55C79A]/20 border border-[#55C79A]/40 flex items-center justify-center text-[#73E3B4]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#E2E2E8]">New Smart Settlement</h2>
              <p className="text-[11px] text-[#87948C]">Split group expenses fairly with zero mental math</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-200 text-xs">
              {error}
            </div>
          )}

          {/* Settlement Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#BCCAC1] flex items-center justify-between">
              <span>Settlement Name</span>
              <span className="text-[10px] text-[#87948C]">Default: {defaultName}</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cox's Bazar Trip, Flat Rent & Food"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-sm text-[#E2E2E8] placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4] transition-colors"
              autoFocus
            />
          </div>

          {/* Members Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#BCCAC1]">
                Group Members ({members.length})
              </label>
              <span className="text-[11px] text-[#73E3B4] font-medium">Min 2 people</span>
            </div>

            {/* Member List */}
            <div className="space-y-2">
              {members.map((member, idx) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-[#111317] border border-[#3D4943]/40"
                >
                  <div className="w-7 h-7 rounded-full bg-[#282A2E] flex items-center justify-center text-xs font-bold text-[#73E3B4]">
                    {idx + 1}
                  </div>
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => handleUpdateMemberName(member.id, e.target.value)}
                    className="flex-1 bg-transparent text-sm text-[#E2E2E8] focus:outline-none font-medium"
                    placeholder="Member Name"
                  />
                  {member.isMe && (
                    <span className="px-2 py-0.5 rounded-md bg-[#55C79A]/20 text-[#73E3B4] text-[10px] font-semibold border border-[#55C79A]/30">
                      You (Me)
                    </span>
                  )}
                  {members.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-1 rounded-md text-[#87948C] hover:text-[#FFB4AB] hover:bg-[#282A2E] cursor-pointer"
                      title="Remove Member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Member Input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMember();
                  }
                }}
                placeholder="Type member name and press Enter..."
                className="flex-1 px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
              />
              <button
                type="button"
                onClick={handleAddMember}
                className="px-3.5 py-2 rounded-xl bg-[#282A2E] hover:bg-[#3D4943]/60 text-[#73E3B4] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Quick Info Box */}
          <div className="p-3.5 rounded-xl bg-[#14161A] border border-[#3D4943]/30 text-xs text-[#87948C] space-y-1">
            <div className="flex items-center gap-1.5 text-[#BCCAC1] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#73E3B4]" />
              <span>Instant, fair and transparent</span>
            </div>
            <p className="leading-relaxed">
              Add shared hotel stays, meals, or rides. EcO computes the minimum number of direct transfers to settle every debt perfectly.
            </p>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#282A2E] hover:bg-[#3D4943]/50 text-xs font-semibold text-[#BCCAC1] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-xs font-bold text-[#003826] cursor-pointer transition-colors shadow-sm"
            >
              Start Settlement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
