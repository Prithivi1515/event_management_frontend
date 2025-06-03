import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TicketHistoryComponent } from './ticket-history.component';

describe('TicketHistoryComponent', () => {
  let component: TicketHistoryComponent;
  let fixture: ComponentFixture<TicketHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketHistoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TicketHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
