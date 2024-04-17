import React, { useCallback, useState } from "react";
import {
  OpenmrsDatePicker,
  showSnackbar,
  useConfig,
  useDebounce,
  useSession,
} from "@openmrs/esm-framework";
import {
  Form,
  Stack,
  ComboBox,
  TextArea,
  MultiSelect,
  Layer,
  FormLabel,
  ButtonSet,
  Button,
  Search,
  InlineLoading,
  Tile,
  Tag,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import styles from "./post-procedure-form.scss";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  savePostProcedure,
  useConditionsSearch,
  useProviders,
} from "./post-procedure.resource";
import { CodedCondition, ProcedurePayload } from "../../types";
import { Result } from "../../work-list/work-list.resource";
import dayjs from "dayjs";
import { closeOverlay } from "../../components/overlay/hook";
import { StringPath, encounterRole, encounterType } from "../../config-schema";

const validationSchema = z.object({
  startDatetime: z.date({ required_error: "Start datetime is required" }),
  endDatetime: z.date({ required_error: "End datetime is required" }),
  outcome: z.string({ required_error: "Outcome is required" }),
  procedureReport: z.string({ required_error: "Procedure report is required" }),
  participants: z.array(
    z.object({
      uuid: z.string(),
      display: z.string(),
      person: z.object({
        uuid: z.string(),
        display: z.string(),
      }),
    }),
    { required_error: "Participants are required" }
  ),
  complications: z.string().optional(),
});

type PostProcedureFormSchema = z.infer<typeof validationSchema>;

type PostProcedureFormProps = {
  patientUuid: string;
  procedure: Result;
};

const PostProcedureForm: React.FC<PostProcedureFormProps> = ({
  patientUuid,
  procedure,
}) => {
  const { sessionLocation } = useSession();
  const { t } = useTranslation();
  const { providers } = useProviders();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearchTerm = useDebounce(searchTerm);
  const { searchResults, isSearching } =
    useConditionsSearch(debouncedSearchTerm);
  const [selectedCondition, setSelectedCondition] =
    useState<CodedCondition>(null);

  const handleSearchInputChange = (event) => {
    const value = event.target.value;
    setSearchTerm(value);
    if (!value) {
      setSelectedCondition(null);
      setShowItems(false);
    } else {
      setShowItems(true);
    }
  };

  const [showItems, setShowItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleSelect = useCallback((item: CodedCondition) => {
    setSelectedCondition(item);
  }, []);

  const {
    procedureComplicationGroupingConceptUuid,
    procedureComplicationConceptUuid,
  } = useConfig();

  const {
    control,
    formState: { errors },
    handleSubmit,
  } = useForm<PostProcedureFormSchema>({
    defaultValues: {},
    resolver: zodResolver(validationSchema),
  });

  const onSubmit = async (data: PostProcedureFormSchema) => {
    const participants = [];
    data.participants.forEach((p) => {
      const provider = {
        provider: p.uuid,
        encounterRole: encounterRole,
      };
      participants.push(provider);
    });
    const complications = [];
    if (selectedCondition) {
      complications.push({
        groupMembers: [
          {
            concept: procedureComplicationConceptUuid,
            value: selectedCondition.concept.uuid,
          },
        ],
        concept: procedureComplicationGroupingConceptUuid,
      });
    }

    const payload: ProcedurePayload = {
      patient: patientUuid,
      procedureOrder: procedure.uuid,
      concept: procedure.concept.uuid,
      procedureReason: procedure.orderReason?.uuid,
      category: procedure.orderType?.uuid,
      status: "COMPLETED",
      outcome: data.outcome,
      location: sessionLocation?.uuid,
      startDatetime: dayjs(data.startDatetime).format("YYYY-MM-DDTHH:mm:ssZ"),
      endDatetime: dayjs(data.endDatetime).format("YYYY-MM-DDTHH:mm:ssZ"),
      procedureReport: data.procedureReport,
      encounters: [
        {
          encounterDatetime: new Date(),
          patient: patientUuid,
          encounterType: encounterType,
          encounterProviders: participants,
          obs: complications,
        },
      ],
    };

    try {
      const response = await savePostProcedure(payload);
      response.status === 201 &&
        showSnackbar({
          title: t("procedureSaved", "Procedure saved"),
          subtitle: t(
            "procedureSavedSuccessfully",
            "Procedure saved successfully"
          ),
          timeoutInMs: 5000,
          isLowContrast: true,
          kind: "success",
        });
      closeOverlay();
    } catch (error) {
      console.error(error);
      showSnackbar({
        title: t("error", "Error"),
        subtitle: t("errorSavingProcedure", "Error saving procedure"),
        timeoutInMs: 5000,
        isLowContrast: true,
        kind: "error",
      });
      closeOverlay();
    }
  };

  const onError = (error: any) => {
    console.error(error);
  };

  return (
    <Form
      onSubmit={handleSubmit(onSubmit, onError)}
      className={styles.formContainer}
    >
      <Stack gap={4}>
        <Layer>
          <FormLabel className={styles.formLabel}>
            {t("date", "Date")}
          </FormLabel>
          <Controller
            control={control}
            name="startDatetime"
            render={({ field: { onChange, value } }) => (
              <OpenmrsDatePicker
                value={value}
                id="startDatetime"
                labelText={t("startDatetime", "Start Datetime")}
                onChange={onChange}
                invalid={!!errors.startDatetime}
                invalidText={errors.startDatetime?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <Controller
            control={control}
            name="endDatetime"
            render={({ field: { onChange, value } }) => (
              <OpenmrsDatePicker
                value={value}
                id="endDatetime"
                labelText={t("endDatetime", "End Datetime")}
                onChange={onChange}
                invalid={!!errors.endDatetime}
                invalidText={errors.endDatetime?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>
            {t("procedureOutcome", "Procedure outcome")}
          </FormLabel>
          <Controller
            control={control}
            name="outcome"
            render={({ field: { onChange } }) => (
              <ComboBox
                onChange={({ selectedItem }) => onChange(selectedItem.id)}
                id="outcome"
                items={[
                  { id: "SUCCESSFUL", text: t("successful", "Successful") },
                  {
                    id: "PARTIALLY_SUCCESSFUL",
                    text: t("partiallySuccessful", "Partially success"),
                  },
                  {
                    id: "NOT_SUCCESSFUL",
                    text: t("notSuccessfully", "Not successful"),
                  },
                ]}
                itemToString={(item) => (item ? item.text : "")}
                titleText={t("outcome", "Outcome")}
                placeholder={t("selectOutcome", "Select outcome")}
                invalid={!!errors.outcome}
                invalidText={errors.outcome?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>
            {t("procedureReport", "Procedure report")}
          </FormLabel>
          <Controller
            control={control}
            name="procedureReport"
            render={({ field: { onChange } }) => (
              <TextArea
                id="procedureReport"
                labelText={t("procedureReport", "Procedure report")}
                rows={4}
                onChange={onChange}
                placeholder={t(
                  "procedureReportPlaceholder",
                  "Enter procedure report"
                )}
                invalid={!!errors.procedureReport}
                invalidText={errors.procedureReport?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>
            {t("participants", "Participants")}
          </FormLabel>
          <Controller
            control={control}
            name="participants"
            render={({ field: { onChange } }) => (
              <MultiSelect
                id="participants"
                titleText={t("participants", "Participants")}
                label={t("selectParticipants", "Select participants")}
                items={providers}
                onChange={({ selectedItems }) => onChange(selectedItems)}
                itemToString={(item) => (item ? item.display : "")}
                selectionFeedback="top-after-reopen"
                placeholder={t("selectParticipants", "Select participants")}
                invalid={!!errors.participants}
                invalidText={errors.participants?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>
            {t("complications", "Complications")}
          </FormLabel>
          <div>
            {selectedItems?.map(
              (item) =>
                (
                  <>
                    <Tag
                      style={{ display: "inline-flex", alignItems: "center" }}
                    >
                      <span style={{ marginRight: "8px" }}>{item.display}</span>
                      <svg
                        focusable="false"
                        fill="currentColor"
                        width="16"
                        height="16"
                        viewBox="0 0 32 32"
                        aria-hidden="true"
                        onClick={() =>
                          setSelectedItems((prevItems) =>
                            prevItems.filter((i) => i !== item)
                          )
                        }
                      >
                        <path d={StringPath}></path>
                      </svg>
                    </Tag>
                  </>
                ) ?? "-"
            )}
          </div>
          <div>
            <Search
              autoFocus
              size="md"
              id="conditionsSearch"
              placeholder={t("complications", "complications")}
              labelText={t("enterCondition", "Enter condition")}
              onChange={handleSearchInputChange}
              onClear={() => setSearchTerm("")}
            />
            {searchResults?.length === 0 ? (
              <div className={styles.filterEmptyState}>
                <Layer level={0}>
                  <Tile className={styles.filterEmptyStateTile}>
                    <span className={styles.filterEmptyStateContent}>
                      <strong>{debouncedSearchTerm}</strong>
                    </span>
                  </Tile>
                </Layer>
              </div>
            ) : (
              showItems && (
                <ul className={styles.complicationsList}>
                  {searchResults.map((item) => (
                    <li
                      key={item?.concept?.uuid}
                      role="menuitem"
                      tabIndex={0}
                      className={styles.complicationService}
                      onClick={() => {
                        handleSelect(item);
                        setSelectedItems((prevItems) => [...prevItems, item]);
                        setShowItems(false);
                      }}
                    >
                      {item.display}
                    </li>
                  ))}
                </ul>
              )
            )}
            {isSearching && (
              <InlineLoading description="Loading complications..." />
            )}
          </div>
        </Layer>
      </Stack>
      <ButtonSet className={styles.buttonSetContainer}>
        <Button size="lg" kind="secondary">
          {t("discard", "Discard")}
        </Button>
        <Button type="submit" size="lg" kind="primary">
          {t("saveAndClose", "Save & Close")}
        </Button>
      </ButtonSet>
    </Form>
  );
};

export default PostProcedureForm;
function setValue(arg0: string, arg1: CodedCondition[]) {
  throw new Error("Function not implemented.");
}
