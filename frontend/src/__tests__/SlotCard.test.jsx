import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SlotCard from "../components/SlotCard";

const slot = { id: 7, service: "Dental Checkup", start_time: "10:00:00", end_time: "10:45:00", capacity: 1, spots_left: 1, my_booking_id: null };

describe("SlotCard", () => {
  it("shows the time, service and a Book button that calls onBook", async () => {
    const onBook = vi.fn();
    render(<SlotCard slot={slot} onBook={onBook} />);
    expect(screen.getByText("10:00 – 10:45 AM")).toBeInTheDocument();
    expect(screen.getByText("Dental Checkup")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /book dental checkup/i }));
    expect(onBook).toHaveBeenCalledWith(slot);
  });

  it("disables the button when the slot is full", () => {
    render(<SlotCard slot={{ ...slot, spots_left: 0 }} onBook={() => {}} />);
    expect(screen.getByRole("button", { name: "Full" })).toBeDisabled();
  });

  it("shows that the customer already holds this slot", () => {
    render(<SlotCard slot={{ ...slot, my_booking_id: 3 }} onBook={() => {}} />);
    expect(screen.getByText(/you are booked/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Booked" })).toBeDisabled();
  });
});
