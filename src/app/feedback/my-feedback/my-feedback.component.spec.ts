import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyFeedbackComponent } from './my-feedback.component';

describe('MyFeedbackComponent', () => {
  let component: MyFeedbackComponent;
  let fixture: ComponentFixture<MyFeedbackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyFeedbackComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyFeedbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
