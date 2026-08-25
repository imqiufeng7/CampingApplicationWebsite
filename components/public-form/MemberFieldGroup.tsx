"use client";

import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SectionCard } from "@/components/public-form/SectionCard";
import { FileUploadField } from "@/components/public-form/FileUploadField";
import { BirthDateWheelPicker } from "@/components/public-form/BirthDateWheelPicker";
import { BirthDateCalendarPicker } from "@/components/public-form/BirthDateCalendarPicker";
import type { RegistrationFormInput } from "@/lib/validation/registration-schema";
import type { Database } from "@/lib/db/types";

type IdentityType = Database["public"]["Tables"]["session_identity_types"]["Row"];
type FeeCategory = Database["public"]["Tables"]["session_fee_categories"]["Row"];

export function MemberFieldGroup({
  control,
  setValue,
  index,
  sessionId,
  identityTypes,
  feeCategories,
  hideFeeCategory,
  onRemove,
  removable,
}: {
  control: Control<RegistrationFormInput>;
  setValue: UseFormSetValue<RegistrationFormInput>;
  index: number;
  sessionId: string;
  identityTypes: IdentityType[];
  feeCategories: FeeCategory[];
  // true for registration categories marked 整組免費 (e.g. 自搭帳篷) — the whole group
  // is unconditionally free, so there's nothing to apply for and nothing to review.
  hideFeeCategory?: boolean;
  onRemove: () => void;
  removable: boolean;
}) {
  const isStaff = useWatch({ control, name: `members.${index}.is_staff` });
  const orgSelected = useWatch({ control, name: `members.${index}.org_selected` });
  const feeCategoryId = useWatch({ control, name: `members.${index}.fee_category_id` });
  const files = useWatch({ control, name: `members.${index}.files` }) ?? [];
  const birthYear = useWatch({ control, name: `members.${index}.birth_year_roc` }) as
    | number
    | undefined;
  const birthMonth = useWatch({ control, name: `members.${index}.birth_month` }) as
    | number
    | undefined;
  const birthDay = useWatch({ control, name: `members.${index}.birth_day` }) as number | undefined;

  // Most sessions only ever define one identity type that needs an org field
  // (工作人員); if a session has none, there's nothing for the checkbox below to do,
  // so it's hidden entirely rather than shown for no reason.
  const staffIdentityType = identityTypes.find((it) => it.requires_org_field);
  const selectedFeeCategory = feeCategories.find((fc) => fc.id === feeCategoryId);
  const requiredDocType = selectedFeeCategory?.required_document_type ?? null;
  const uploadedForDoc = requiredDocType
    ? files.find((f) => f.file_type === requiredDocType)
    : undefined;

  return (
    <SectionCard
      title={index === 0 ? "聯絡人（成員 1）" : `成員 ${index + 1}`}
      action={
        removable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-secondary-foreground hover:bg-secondary-foreground/10"
            onClick={onRemove}
          >
            移除
          </Button>
        )
      }
      contentClassName="grid gap-4 sm:grid-cols-2"
    >
        {index === 0 && (
          <>
            <FormField
              control={control}
              name="contact_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>聯絡 Email（必填）</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>聯絡電話（必填）</FormLabel>
                  <FormControl>
                    <Input placeholder="0912-345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <FormField
          control={control}
          name={`members.${index}.name`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>姓名（必填）</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`members.${index}.id_number`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>身分證字號（必填）</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="sm:col-span-2">
          <FormLabel className="mb-2">出生日期（民國，必填）</FormLabel>
          {/* Small screens keep the scroll-wheel picker (fast for touch); sm and up
              switch to a calendar so a mouse/keyboard user isn't stuck scrolling
              through ~95 years one row at a time. Both stay ROC-numbered — the
              calendar's year/month selects are 民國, not Gregorian. */}
          <div className="sm:hidden">
            <BirthDateWheelPicker
              year={birthYear}
              month={birthMonth}
              day={birthDay}
              onYearChange={(v) =>
                setValue(`members.${index}.birth_year_roc`, v, { shouldValidate: true, shouldDirty: true })
              }
              onMonthChange={(v) =>
                setValue(`members.${index}.birth_month`, v, { shouldValidate: true, shouldDirty: true })
              }
              onDayChange={(v) =>
                setValue(`members.${index}.birth_day`, v, { shouldValidate: true, shouldDirty: true })
              }
            />
          </div>
          <div className="hidden sm:block">
            <BirthDateCalendarPicker
              year={birthYear}
              month={birthMonth}
              day={birthDay}
              onYearChange={(v) =>
                setValue(`members.${index}.birth_year_roc`, v, { shouldValidate: true, shouldDirty: true })
              }
              onMonthChange={(v) =>
                setValue(`members.${index}.birth_month`, v, { shouldValidate: true, shouldDirty: true })
              }
              onDayChange={(v) =>
                setValue(`members.${index}.birth_day`, v, { shouldValidate: true, shouldDirty: true })
              }
            />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <FormField
              control={control}
              name={`members.${index}.birth_year_roc`}
              render={() => (
                <FormItem>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`members.${index}.birth_month`}
              render={() => (
                <FormItem>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`members.${index}.birth_day`}
              render={() => (
                <FormItem>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={control}
          name={`members.${index}.gender`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>生理性別（必填）</FormLabel>
              <FormControl>
                <select
                  {...field}
                  className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="">請選擇</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                  <option value="跨性別">跨性別</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`members.${index}.midnight_snack_diet`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>宵夜葷素（必填）</FormLabel>
              <FormControl>
                <select
                  {...field}
                  className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="">請選擇</option>
                  <option value="葷">葷</option>
                  <option value="素">素</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`members.${index}.breakfast_diet`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>早餐葷素（必填）</FormLabel>
              <FormControl>
                <select
                  {...field}
                  className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="">請選擇</option>
                  <option value="葷">葷</option>
                  <option value="素">素</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`members.${index}.household_address`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>戶籍地址（必填）</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!hideFeeCategory && (
          <FormField
            control={control}
            name={`members.${index}.fee_category_id`}
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>是否申請免付費/減免資格（選填）</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
                  >
                    <option value="">不申請</option>
                    {feeCategories
                      // Inactive categories are hidden from new selections, but a
                      // member's already-selected (now-deactivated) category must stay
                      // visible here or their existing choice would silently vanish.
                      .filter((fc) => fc.is_active || fc.id === feeCategoryId)
                      .map((fc) => (
                        <option key={fc.id} value={fc.id}>
                          {fc.code ? `${fc.code} ` : ""}
                          {fc.label}（{fc.applies_to}）
                        </option>
                      ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!hideFeeCategory && requiredDocType && (
          <FormField
            control={control}
            name={`members.${index}.files`}
            render={() => (
              <FormItem className="sm:col-span-2">
                <FormLabel>應檢附證明文件（必填）：{requiredDocType}</FormLabel>
                <FormControl>
                  <FileUploadField
                    sessionId={sessionId}
                    fileType={requiredDocType}
                    storagePath={uploadedForDoc?.storage_path ?? null}
                    onUploaded={(path) => {
                      const next = files.filter((f) => f.file_type !== requiredDocType);
                      next.push({ file_type: requiredDocType, storage_path: path });
                      setValue(`members.${index}.files`, next, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                    onRemove={() => {
                      const next = files.filter((f) => f.file_type !== requiredDocType);
                      setValue(`members.${index}.files`, next, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {staffIdentityType && (
          <>
            <FormField
              control={control}
              name={`members.${index}.is_staff`}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 sm:col-span-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">
                    我是工作人員（代表機關/單位/團體出席）
                  </FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isStaff && (
              <>
                <FormField
                  control={control}
                  name={`members.${index}.org_selected`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>所屬單位（必填）</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
                        >
                          <option value="">請選擇</option>
                          {(staffIdentityType.org_options as unknown as string[]).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {orgSelected === "民間團體" && (
                  <FormField
                    control={control}
                    name={`members.${index}.org_other_text`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>團體全名（必填）</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
          </>
        )}
    </SectionCard>
  );
}
