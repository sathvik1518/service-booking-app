import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BookPage from "../pages/BookPage";
import { ToastProvider } from "../context/ToastContext";
import * as api from "../api";

vi.mock("../api");
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { name: "Aarav Sharma", role: "customer" } }) }));

// Slots a few days ahead so the "first day with open slots" logic has something to pick.
const future = new Date(Date.now() + 3 * 86400000);
const day = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
const slots = [
  { id: 1, service: "General Consultation", slot_date: day, start_time: "09:00:00", end_time: "09:30:00", capacity: 1, booked_count: 0, spots_left: 1, my_booking_id: null },
  { id: 2, service: "Dental Checkup", slot_date: day, start_time: "10:00:00", end_time: "10:45:00", capacity: 1, booked_count: 0, spots_left: 1, my_booking_id: null },
  { id: 3, service: "Dental Checkup", slot_date: day, start_time: "10:45:00", end_time: "11:30:00", capacity: 1, booked_count: 1, spots_left: 0, my_booking_id: null },
];

function show() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <BookPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("BookPage", () => {
  beforeEach(() => {
    api.getSlots.mockResolvedValue(slots);
  });

  it("greets the customer and lists the open slots", async () => {
    show();
    expect(await screen.findByText(/Hi Aarav/)).toBeInTheDocument();
    expect(await screen.findByText("9:00 – 9:30 AM")).toBeInTheDocument();
    expect(screen.getByText("10:00 – 10:45 AM")).toBeInTheDocument();
  });

  it("filters by service", async () => {
    show();
    await screen.findByText("9:00 – 9:30 AM");
    await userEvent.click(screen.getByRole("button", { name: "Dental Checkup" }));
    expect(screen.queryByText("9:00 – 9:30 AM")).not.toBeInTheDocument();
    expect(screen.getByText("10:00 – 10:45 AM")).toBeInTheDocument();
  });

  it("marks a full slot as Full", async () => {
    show();
    await screen.findByText("9:00 – 9:30 AM");
    expect(screen.getByRole("button", { name: "Full" })).toBeDisabled();
  });

  it("books a slot after the customer confirms", async () => {
    api.createBooking.mockResolvedValue({ id: 9, service: "General Consultation", slot_date: day });
    show();
    await screen.findByText("9:00 – 9:30 AM");
    await userEvent.click(screen.getByRole("button", { name: /book general consultation/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/note for the clinic/i), "First visit");
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm booking/i }));
    expect(api.createBooking).toHaveBeenCalledWith(1, "First visit");
    expect(await screen.findByText(/Booked General Consultation/)).toBeInTheDocument();
  });

  it("shows the server message when the slot was just taken", async () => {
    api.createBooking.mockRejectedValue(Object.assign(new Error("Sorry, that slot is fully booked"), { status: 409 }));
    show();
    await screen.findByText("9:00 – 9:30 AM");
    await userEvent.click(screen.getByRole("button", { name: /book general consultation/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm booking/i }));
    expect(await within(dialog).findByText("Sorry, that slot is fully booked")).toBeInTheDocument();
  });

  it("shows a friendly message when there are no slots", async () => {
    api.getSlots.mockResolvedValue([]);
    show();
    expect(await screen.findByText(/No appointments are open/)).toBeInTheDocument();
  });

  it("shows an error with a retry button when loading fails", async () => {
    api.getSlots.mockRejectedValue(new Error("Cannot reach the server"));
    show();
    expect(await screen.findByText("Cannot reach the server")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
